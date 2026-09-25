# 后端实现规格

## 1. 目标目录结构

在现有项目结构上新增：

```text
backend/app/
├── api/
│   └── router.py                      # 修改：注册写作路由
├── core/
│   └── config.py                      # 修改：增加写作配置
├── models/
│   └── entities.py                    # 修改：增加写作模型和枚举
├── repositories/
│   └── repositories.py                # 修改：增加 WritingRepository
├── schemas/
│   └── models.py                      # 修改：增加写作 Pydantic schema
└── services/
    ├── writing.py                     # 新增：写作业务编排
    ├── writing_grammar.py             # 新增：语法检测 Provider
    └── writing_presence.py            # 新增：页面停留服务
```

## 2. 新增模型和枚举

在 `backend/app/models/entities.py` 中新增：

```python
class WritingAssignmentStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"

class WritingGrammarHintMode(StrEnum):
    OFF = "off"
    AFTER_SUBMIT = "after_submit"

class WritingSubmissionStatus(StrEnum):
    DRAFTING = "drafting"
    REVISING = "revising"
    FINALIZED = "finalized"

class WritingGrammarStatus(StrEnum):
    NOT_APPLICABLE = "not_applicable"
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
```

模型：

```python
class WritingAssignment(Base, TimestampMixin): ...
class WritingSubmission(Base, TimestampMixin): ...
class WritingRevision(Base, TimestampMixin): ...
class WritingGrammarIssue(Base, TimestampMixin): ...
class WritingPresenceVisit(Base, TimestampMixin): ...
class WritingIntegrityEvent(Base, TimestampMixin): ...
```

字段、约束和索引以 `data-model.md` 为准。

## 3. 新增 Schema

在 `backend/app/schemas/models.py` 中新增：

- `WritingAssignmentCreate`
- `WritingAssignmentOut`
- `WritingSubmissionOut`
- `WritingRevisionOut`
- `WritingGrammarIssueOut`
- `WritingDraftUpdate`
- `WritingSubmitRequest`
- `WritingPresenceEnterRequest`
- `WritingPresenceHeartbeatRequest`
- `WritingPresenceLeaveRequest`
- `WritingIntegrityRequest`
- `WritingTeacherSubmissionSummary`
- `WritingTeacherSubmissionDetail`

所有 datetime 字段在 Pydantic 中按现有模式处理为 aware datetime。

## 4. Repository

新增 `WritingRepository`，负责：

- `get_assignment(assignment_id)`
- `assignments_for_teacher(teacher_id)`
- `assignments_for_student(student_id)`
- `get_submission(submission_id, for_update=False)`
- `get_submission_for_assignment_student(assignment_id, student_id)`
- `submissions_for_assignment(assignment_id)`
- `latest_revision(submission_id)`
- `open_visit(submission_id, client_visit_id)`
- `visits_for_submission(submission_id)`
- `integrity_events_for_submission(submission_id)`

所有关系加载使用 `joinedload` 或 `selectinload`，避免 N+1。

## 5. WritingService

职责：

- 创建/获取写作提交。
- 保存草稿。
- 提交版本并维护状态机。
- 计算字数。
- 校验权限、时间和字数。
- 聚合教师视图数据。

### 5.1 字数计算

统一规则：

```python
def count_words(text: str) -> int:
    cjk = sum(1 for ch in text if is_cjk(ch))
    non_cjk = re.sub(r"[^\w]+", " ", non_cjk_text)
    latin_words = len([w for w in non_cjk.split() if w])
    return cjk + latin_words
```

该规则同时用于前端显示和后端校验，避免客户端与服务端字数不一致。

### 5.2 提交状态机

```text
drafting -> first submit
revising -> next submit
finalized -> reject all mutations
```

实现时：

- 使用 `SELECT ... FOR UPDATE` 锁定 `WritingSubmission`。
- 在事务内创建 `WritingRevision`。
- 根据 `revision_limit` 更新状态。
- 设置 `latest_revision_id`。
- 若语法策略为 `after_submit`，调用 `WritingGrammarService`。
- 保存语法问题。
- commit。

### 5.3 幂等提交

`WritingSubmitRequest.client_submit_id` 用于幂等。

实现选择：

- 在 `WritingRevision` 上增加唯一约束 `(submission_id, client_submit_id)`，若约束冲突则返回已有最新版本，不重复创建。
- 或者内存/TTL 幂等表。推荐前者，因为数据持久且简单。

`WritingRevision.client_submit_id` 和唯一约束 `(submission_id, client_submit_id)` 已在 `data-model.md` 中定义。

### 5.4 教师聚合

教师提交列表接口计算：

- `latest_revision_number`
- `latest_grammar_issue_count`
- `total_stay_seconds`
- `total_leave_seconds`
- `leave_count`
- `violation_count`

停留/离开计算规则：

1. 按 `started_at` 排序所有 visit。
2. 每个 visit 若 `ended_at` 为空，先按心跳超时规则关闭。
3. `total_stay_seconds = sum(ended_at - started_at)`。
4. 相邻 visit 之间：
   - `leave_seconds = max(0, next.started_at - prev.ended_at)`
5. 若最后一个 visit 有 ended_at，则从 ended_at 到当前时间的离开时长也计入总离开时长。

## 6. WritingGrammarService

文件：
`backend/app/services/writing_grammar.py`

### 6.1 输入输出

输入：

```python
content: str
```

输出：

```python
list[GrammarIssueDraft]
```

`GrammarIssueDraft`:

- `start_offset`
- `end_offset`
- `segment_id`
- `category`
- `message`

### 6.2 分段

实现步骤：

1. 按换行拆成段落。
2. 每段按中英文句子标点切分。
3. 生成 `segment_id`，例如 `p0-s0`。
4. 记录每个 segment 在全文中的 `start_offset`。

发送给 AI 的 JSON：

```json
{
  "segments": [
    {"id": "p0-s0", "text": "This sentence has an error."}
  ]
}
```

### 6.3 Prompt

System prompt 必须包含：

```text
You are a grammar error locator.
You must not correct, rewrite, suggest, or explain.
For each possible grammar issue, return only:
- segment_id
- start and end character offsets inside that segment
- category

Allowed categories:
grammar
subject_verb_agreement
tense
article
preposition
word_order
punctuation
sentence_structure
```

### 6.4 Response validation

后端必须：

- 使用 `response_format={"type":"json_object"}` 或要求严格 JSON。
- 解析失败时返回 `WRITING_GRAMMAR_FAILED`，但不阻塞提交。
- 校验 `segment_id` 存在。
- 校验 `start >= 0`。
- 校验 `end <= len(segment_text)`。
- 校验 `end > start`。
- 去掉重复范围。
- 对重叠范围做合并或取优先级高的类别。
- 将 segment 内偏移换算为全文偏移。

### 6.5 固定提示映射

AI 返回类别，后端映射固定提示：

| Category | Message |
| --- | --- |
| `grammar` | 此处可能存在语法问题 |
| `subject_verb_agreement` | 此处可能存在主谓一致问题 |
| `tense` | 此处可能存在时态问题 |
| `article` | 此处可能存在冠词问题 |
| `preposition` | 此处可能存在介词问题 |
| `word_order` | 此处可能存在语序问题 |
| `punctuation` | 此处可能存在标点问题 |
| `sentence_structure` | 此处可能存在句子结构问题 |

未知类别统一映射为 `grammar`。

### 6.6 配置

在 `app/core/config.py` 增加：

```python
writing_grammar_timeout_seconds: int = 60
writing_grammar_max_chars: int = 12000
writing_presence_heartbeat_timeout_seconds: int = 30
```

## 7. WritingPresenceService

文件：
`backend/app/services/writing_presence.py`

职责：

- `enter(submission_id, student_id, client_visit_id)`
- `heartbeat(submission_id, client_visit_id)`
- `leave(submission_id, client_visit_id, reason)`
- `reconcile(submission_id)`
- `summary(submission_id)`

### 7.1 enter

```text
1. 查找该 submission 所有 ended_at IS NULL 的 visit。
2. 若存在，逐个设置 ended_at=now, end_reason=new_visit。
3. 创建新的 visit。
4. started_at=now
5. last_heartbeat_at=now
```

### 7.2 heartbeat

```text
1. 查找 client_visit_id 对应的 open visit。
2. 若不存在，忽略。
3. 若存在，更新 last_heartbeat_at=now。
```

### 7.3 leave

```text
1. 查找 client_visit_id 对应的 open visit。
2. 若存在，设置 ended_at=now, end_reason=reason。
```

### 7.4 reconcile

```text
1. 查找 ended_at IS NULL 且 last_heartbeat_at < now - timeout 的 visit。
2. ended_at = last_heartbeat_at + timeout。
3. end_reason = idle_timeout。
```

`reconcile` 在以下入口调用：

- 获取写作提交。
- 提交版本。
- 教师查看提交详情。

## 8. 路由注册

`backend/app/api/router.py` 中新增：

```python
from app.services.writing import WritingService
```

建议按学生/教师权限拆分路由函数，保持与现有 router 风格一致。

## 9. 权限

复用 `CurrentUser`、`Student`、`Teacher` 依赖。

`WritingService` 内部做所有权检查：

- 学生读取/写入：`submission.student_id == current_user.id`
- 教师读取：`assignment.teacher_id == current_user.id`

## 10. 异常处理

继续使用 `AppError` 和 `install_exception_handlers`。

新增错误码见 `api-design.md`。

## 11. 管理员删除联动

修改 `backend/app/services/admin.py`：

- 删除教师时，先删除该教师所有 `WritingAssignment`。
- 删除学生时，先删除该学生所有 `WritingSubmission`。
- 删除班级时，先检查是否有写作作业；如有，按现有班级删除策略处理。

写作表之间建议使用 `cascade="all, delete-orphan"`，减少手写级联删除遗漏。
