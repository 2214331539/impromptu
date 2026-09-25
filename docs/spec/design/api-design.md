# API 设计

本文是 API Contract 的唯一来源。

## 1. 现有 API 基线

现有 API 前缀为 `/api/v1`，主要领域包括：

| Area | Path | 角色 |
| --- | --- | --- |
| Auth | `/auth/*` | 公开或当前用户 |
| Admin | `/admin/*` | Admin |
| Dashboard | `/dashboard` | Student / Teacher |
| Classes | `/classes/*` | Teacher / Student |
| Topic Banks | `/topic-banks/*`, `/topics/*` | Teacher |
| Tasks | `/tasks/*` | Teacher / Student |
| Training Sessions | `/sessions/*` | Teacher / Student |
| Recordings | `/recordings/*` | Teacher / Student |

新写作 API 同样放在 `/api/v1` 下。

## 2. 通用约定

- 认证方式：`Authorization: Bearer <JWT>`。
- 请求体和响应体默认 JSON，除文件上传外。
- 时间字段使用 ISO 8601 UTC。
- 服务端时间是 Source of Truth。
- 错误响应沿用现有统一错误结构：

```json
{
  "error": {
    "code": "WRITING_ASSIGNMENT_NOT_FOUND",
    "message": "写作任务不存在"
  }
}
```

## 3. 学生写作 API

### API-W001 获取学生可见写作任务

```http
GET /writing/assignments
```

Authentication:
Student

Request:
无

Response:
`200`

```json
[
  {
    "id": 1,
    "title": "Essay 1",
    "class_id": 3,
    "class_name": "Class A",
    "instructions": "Write about...",
    "status": "published",
    "starts_at": "2026-09-18T00:00:00Z",
    "due_at": "2026-09-25T00:00:00Z",
    "min_words": 50,
    "max_words": null,
    "grammar_hint_mode": "after_submit",
    "revision_limit": 1,
    "my_submission_id": 10,
    "my_submission_status": "drafting"
  }
]
```

Side Effects:
无

### API-W002 获取写作任务详情

```http
GET /writing/assignments/{assignment_id}
```

Authentication:
Student

Response:
`200`，结构同列表项。

Errors:

- `404 WRITING_ASSIGNMENT_NOT_FOUND`
- `403 FORBIDDEN`

### API-W003 创建或获取写作提交

```http
POST /writing/assignments/{assignment_id}/submissions
```

Authentication:
Student

Request:
空 JSON 或不带 body。

Response:
`200`

返回 `WritingSessionOut`。

Side Effects:
- 不存在时创建一条 `WritingSubmission`。
- 存在时直接返回。

Errors:

- `400 WRITING_ASSIGNMENT_NOT_STARTED`
- `400 WRITING_ASSIGNMENT_CLOSED`
- `403 FORBIDDEN`

### API-W004 获取写作提交

```http
GET /writing/submissions/{submission_id}
```

Authentication:
Student

Response:
`200 WritingSessionOut`

`WritingSessionOut`:

```json
{
  "id": 10,
  "assignment_id": 1,
  "student_id": 21,
  "status": "revising",
  "draft_content": "current draft",
  "draft_word_count": 92,
  "draft_updated_at": "2026-09-18T10:00:00Z",
  "first_submitted_at": "2026-09-18T09:00:00Z",
  "final_submitted_at": null,
  "revisions": [
    {
      "id": 30,
      "revision_number": 0,
      "content": "submitted text",
      "word_count": 90,
      "grammar_status": "completed",
      "grammar_issue_count": 2,
      "submitted_at": "2026-09-18T09:00:00Z",
      "issues": [
        {
          "id": 1,
          "start_offset": 12,
          "end_offset": 25,
          "category": "subject_verb_agreement",
          "message": "此处可能存在主谓一致问题"
        }
      ]
    }
  ],
  "remaining_revisions": 1,
  "server_time": "2026-09-18T10:00:05Z"
}
```

### API-W005 保存草稿

```http
PATCH /writing/submissions/{submission_id}/draft
```

Authentication:
Student

Request:

```json
{
  "content": "draft text"
}
```

Response:
`200 WritingSessionOut`

Side Effects:
- 更新 `draft_content`、`draft_word_count`、`draft_updated_at`。

Errors:

- `400 WRITING_CONTENT_TOO_SHORT`
- `400 WRITING_CONTENT_TOO_LONG`
- `409 WRITING_SUBMISSION_FINALIZED`
- `409 WRITING_ASSIGNMENT_CLOSED`

### API-W006 提交写作版本

```http
POST /writing/submissions/{submission_id}/submit
```

Authentication:
Student

Request:

```json
{
  "content": "final text to submit",
  "client_submit_id": "uuid-or-stable-id"
}
```

`client_submit_id` 用于幂等，防止前端重试重复创建版本。后端可保存或作为短时幂等键。

Response:
`200 WritingSessionOut`

Side Effects:
- 创建 `WritingRevision`。
- 更新 `WritingSubmission` 状态、首次/最终提交时间。
- 若 `grammar_hint_mode=after_submit`，同步检测并保存问题。

Errors:

- `400 WRITING_CONTENT_TOO_SHORT`
- `400 WRITING_CONTENT_TOO_LONG`
- `409 WRITING_SUBMISSION_FINALIZED`
- `409 WRITING_ASSIGNMENT_CLOSED`
- `409 WRITING_REVISION_LIMIT_REACHED`

### API-W007 重试最新版本语法检测

```http
POST /writing/submissions/{submission_id}/retry-grammar
```

Authentication:
Student

Request:
无

Response:
`200 WritingSessionOut`

Side Effects:
- 重新检测最新 `WritingRevision`，不创建新版本。

Errors:

- `404 WRITING_REVISION_NOT_FOUND`
- `409 WRITING_GRAMMAR_NOT_ENABLED`

### API-W008 进入写作页面

```http
POST /writing/submissions/{submission_id}/presence/enter
```

Authentication:
Student

Request:

```json
{
  "client_visit_id": "uuid"
}
```

Response:
`204`

Side Effects:
- 关闭该提交已有 open visit。
- 创建新的 open visit。

### API-W009 页面心跳

```http
POST /writing/submissions/{submission_id}/presence/heartbeat
```

Authentication:
Student

Request:

```json
{
  "client_visit_id": "uuid"
}
```

Response:
`204`

Side Effects:
- 更新匹配 open visit 的 `last_heartbeat_at`。

### API-W010 离开写作页面

```http
POST /writing/submissions/{submission_id}/presence/leave
```

Authentication:
Student

Request:

```json
{
  "client_visit_id": "uuid",
  "reason": "leave"
}
```

Response:
`204`

Side Effects:
- 若匹配 visit 仍 open，设置 `ended_at` 和 `end_reason`。

### API-W011 上报违规尝试

```http
POST /writing/submissions/{submission_id}/integrity
```

Authentication:
Student

Request:

```json
{
  "event_type": "paste_blocked",
  "source": "keydown",
  "detail": "Ctrl+V"
}
```

Response:
`204`

Side Effects:
- 写入 `WritingIntegrityEvent`。

## 4. 教师写作 API

### API-W012 获取教师写作任务

```http
GET /writing/assignments
```

Authentication:
Teacher

Response:
`200`

列表项增加：

```json
{
  "id": 1,
  "title": "Essay 1",
  "class_id": 3,
  "class_name": "Class A",
  "status": "published",
  "starts_at": "2026-09-18T00:00:00Z",
  "due_at": "2026-09-25T00:00:00Z",
  "grammar_hint_mode": "after_submit",
  "revision_limit": 1,
  "participant_count": 20,
  "submitted_count": 12,
  "finalized_count": 8
}
```

### API-W013 创建写作任务

```http
POST /writing/assignments
```

Authentication:
Teacher

Request:

```json
{
  "title": "Essay 1",
  "class_id": 3,
  "instructions": "Write about...",
  "starts_at": "2026-09-18T00:00:00Z",
  "due_at": "2026-09-25T00:00:00Z",
  "min_words": 50,
  "max_words": null,
  "grammar_hint_mode": "after_submit",
  "revision_limit": 1,
  "allow_late_submission": false
}
```

Response:
`201 WritingAssignmentOut`

Errors:

- `400 WRITING_ASSIGNMENT_INVALID_DATES`
- `400 WRITING_CLASS_NOT_FOUND`
- `503 WRITING_GRAMMAR_NOT_CONFIGURED`

### API-W014 发布写作任务

```http
POST /writing/assignments/{assignment_id}/publish
```

Authentication:
Teacher

Response:
`200 WritingAssignmentOut`

Errors:

- `404 WRITING_ASSIGNMENT_NOT_FOUND`
- `409 WRITING_ASSIGNMENT_ALREADY_PUBLISHED`

### API-W015 关闭写作任务

```http
POST /writing/assignments/{assignment_id}/close
```

Authentication:
Teacher

Response:
`200 WritingAssignmentOut`

Errors:

- `404 WRITING_ASSIGNMENT_NOT_FOUND`
- `409 WRITING_ASSIGNMENT_NOT_PUBLISHED`

### API-W016 获取学生提交列表

```http
GET /writing/assignments/{assignment_id}/submissions
```

Authentication:
Teacher

Response:
`200`

```json
[
  {
    "submission_id": 10,
    "student_id": 21,
    "student_no": "250001",
    "student_name": "Student",
    "status": "finalized",
    "draft_word_count": 92,
    "latest_revision_number": 1,
    "latest_grammar_issue_count": 3,
    "first_submitted_at": "2026-09-18T09:00:00Z",
    "final_submitted_at": "2026-09-18T09:30:00Z",
    "total_stay_seconds": 1800,
    "total_leave_seconds": 420,
    "leave_count": 2,
    "violation_count": 1
  }
]
```

### API-W017 获取单份提交详情

```http
GET /writing/submissions/{submission_id}
```

Authentication:
Teacher

Response:
`200 WritingTeacherSubmissionOut`

包含：

- 学生信息。
- 全部 `WritingRevision` 和语法问题。
- 全部停留/离开区间。
- 违规事件。

## 5. 错误码

| Code | HTTP | 说明 |
| --- | --- | --- |
| `WRITING_ASSIGNMENT_NOT_FOUND` | 404 | 写作任务不存在或无权限 |
| `WRITING_ASSIGNMENT_NOT_STARTED` | 400 | 尚未开始 |
| `WRITING_ASSIGNMENT_CLOSED` | 409 | 已关闭或截止且不允许补交 |
| `WRITING_ASSIGNMENT_INVALID_DATES` | 400 | 时间不合法 |
| `WRITING_ASSIGNMENT_ALREADY_PUBLISHED` | 409 | 已发布 |
| `WRITING_ASSIGNMENT_NOT_PUBLISHED` | 409 | 未发布 |
| `WRITING_SUBMISSION_NOT_FOUND` | 404 | 提交不存在 |
| `WRITING_SUBMISSION_FINALIZED` | 409 | 提交已锁定 |
| `WRITING_CONTENT_TOO_SHORT` | 400 | 字数不足 |
| `WRITING_CONTENT_TOO_LONG` | 400 | 字数超限 |
| `WRITING_REVISION_LIMIT_REACHED` | 409 | 修改次数用尽 |
| `WRITING_GRAMMAR_NOT_ENABLED` | 409 | 语法检测未启用 |
| `WRITING_GRAMMAR_NOT_CONFIGURED` | 503 | AI 配置不存在 |
| `WRITING_GRAMMAR_FAILED` | 502 | AI 检测失败 |
| `WRITING_PRESENCE_VISIT_NOT_FOUND` | 404 | 停留记录不存在 |

