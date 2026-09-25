# 前端实现规格

## 1. 新增页面

| Page | Route | 角色 |
| --- | --- | --- |
| 写作任务列表 | `/app/writing` | Student |
| 写作任务详情 | `/app/writing/:assignmentId` | Student |
| 写作页面 | `/app/writing/session/:submissionId` | Student |
| 写作任务列表 | `/teacher/writing` | Teacher |
| 创建写作任务 | `/teacher/writing/new` | Teacher |
| 写作提交列表 | `/teacher/writing/:assignmentId/submissions` | Teacher |
| 写作提交详情 | `/teacher/writing/submissions/:submissionId` | Teacher |

## 2. 修改文件

| File | Change |
| --- | --- |
| `frontend/src/routes/AppRoutes.tsx` | 增加上述路由 |
| `frontend/src/components/layout/AppShell.tsx` | 学生导航增加“写作任务”，教师导航增加“写作” |
| `frontend/src/types/index.ts` | 增加写作类型 |
| `frontend/src/api/client.ts` | 不需要修改，直接复用 `api<T>` |

## 3. 新增类型

```ts
export type WritingAssignmentStatus = "draft" | "published" | "closed";
export type WritingGrammarHintMode = "off" | "after_submit";
export type WritingSubmissionStatus = "drafting" | "revising" | "finalized";
export type WritingGrammarStatus = "not_applicable" | "pending" | "completed" | "failed";

export interface WritingAssignment {
  id: number;
  title: string;
  class_id: number;
  class_name: string;
  instructions: string;
  status: WritingAssignmentStatus;
  starts_at: string;
  due_at: string;
  min_words: number;
  max_words: number | null;
  grammar_hint_mode: WritingGrammarHintMode;
  revision_limit: number;
  allow_late_submission: boolean;
  my_submission_id: number | null;
  my_submission_status: WritingSubmissionStatus | null;
}

export interface WritingGrammarIssue {
  id: number;
  start_offset: number;
  end_offset: number;
  segment_id: string | null;
  category: string;
  message: string;
}

export interface WritingRevision {
  id: number;
  revision_number: number;
  content: string;
  word_count: number;
  grammar_status: WritingGrammarStatus;
  grammar_issue_count: number;
  submitted_at: string;
  issues: WritingGrammarIssue[];
}

export interface WritingSubmission {
  id: number;
  assignment_id: number;
  student_id: number;
  status: WritingSubmissionStatus;
  draft_content: string;
  draft_word_count: number;
  draft_updated_at: string;
  first_submitted_at: string | null;
  final_submitted_at: string | null;
  revisions: WritingRevision[];
  remaining_revisions: number;
  server_time: string;
}
```

## 4. 学生写作任务列表

`WritingListPage.tsx`

Server State:

- `useQuery(["writing-assignments"], () => api("/writing/assignments"))`

Local State:

- 筛选：全部、待完成、已完成。

UI:

- 显示标题、班级、截止时间、状态、语法检测标签、我的提交状态。
- 未发布任务不出现在学生列表。

Loading/Error/Empty:

- Loading 显示 `LoadingState`。
- Error 显示 `ErrorState`。
- Empty 显示“还没有写作任务”。

## 5. 学生写作任务详情

`WritingTaskDetailPage.tsx`

Server State:

- `useQuery(["writing-assignment", id], ...)`

Local State:

- 无特殊本地状态。

Action:

- 点击“开始写作”或“继续写作”：
  1. `POST /writing/assignments/{id}/submissions`
  2. 成功后跳转 `/app/writing/session/{submissionId}`

展示：

- 写作要求。
- 开始/截止时间。
- 最少/最多字数。
- 语法检测策略和修改次数。
- 当前状态。

## 6. 学生写作页面

`WritingPage.tsx` 是核心页面。

### 6.1 页面状态

Server State:

- `useQuery(["writing-submission", submissionId], ...)`
- 请求成功后开始页面停留追踪。

Local State:

- 当前编辑内容。
- 保存状态：`saved | saving | error`。
- 提交 loading。
- 检测失败提示。

### 6.2 编辑器

使用原生 `textarea`。

Props/Data:

- `value = draft ?? submission.draft_content`
- `onChange` 更新本地 draft。
- `onPaste`、`onCopy`、`onCut`、`onDrop`、`onContextMenu` 阻止并上报。

字数显示：

- 使用与后端一致的中英文混合字数公式。

### 6.3 自动保存

复用现有 `PreparationStage` 的 debounce 模式：

```ts
useEffect(() => {
  if (draft === undefined || draft === submission.draft_content) return;
  const timer = setTimeout(() => save.mutate(draft), 1200);
  return () => clearTimeout(timer);
}, [draft, submission.draft_content]);
```

### 6.4 首次提交前

- 只有编辑器、字数和“提交初稿”按钮。
- 不请求语法检测。
- 不显示语法问题。

### 6.5 首次提交后

页面变为两栏：

- 左栏：可编辑文本，用于修改。
- 右栏：最新提交版本的语法标注结果。

右栏 `GrammarIssuePanel`：

- 输入最新 `WritingRevision.content` 和 `issues`。
- 输出只读高亮文本和问题列表。
- 问题列表不包含正确写法。

点击问题项：

```text
用户在问题列表中点击某条问题。
前端根据 start_offset / end_offset 在左侧 textarea 中执行 focus + setSelectionRange。
```

### 6.6 修改和最终提交

- 若 `status === "revising"` 且 `remaining_revisions > 0`，显示“提交修改”。
- 若 `status === "finalized"`，编辑器 `readOnly`，显示“已最终提交”。

### 6.7 Loading/Error/Empty

- Loading: `LoadingState`。
- Error: `ErrorState`。
- 空草稿: 显示“开始写作”。

## 7. 复制粘贴拦截 Hook

`frontend/src/hooks/useAntiCopyPaste.ts`

接口：

```ts
function useAntiCopyPaste(active: boolean, report: (event: IntegrityEvent) => void): void
```

行为：

- `active=false` 时不拦截。
- 监听：
  - `copy`
  - `cut`
  - `paste`
  - `drop`
  - `contextmenu`
- `keydown` 拦截 `Ctrl/Cmd + C/X/V`。
- 阻止默认行为。
- 节流上报，同一事件类型 5 秒最多上报 1 次。
- 卸载时移除监听。

## 8. 页面停留追踪 Hook

`frontend/src/hooks/useWritingPresence.ts`

接口：

```ts
function useWritingPresence(submissionId: number, enabled: boolean): void
```

行为：

- 挂载时生成 `client_visit_id` 并调用 `enter`。
- 每 10 秒 `heartbeat`。
- `visibilitychange`:
  - hidden -> `leave(reason="visibility_hidden")`
  - visible -> `enter()`
- `pagehide` -> `leave(reason="pagehide")`，使用 `fetch(..., keepalive: true)`。
- 路由卸载 -> `leave(reason="leave")`。

## 9. 教师写作任务列表

`WritingAssignmentsPage.tsx`

Server State:

- `useQuery(["writing-assignments"], ...)`

Actions:

- 发布、关闭、查看提交、新建。

## 10. 教师创建写作任务

`WritingAssignmentCreatePage.tsx`

Form 字段：

- 标题
- 班级
- 写作要求
- 开始时间
- 截止时间
- 最少字数
- 最多字数
- 语法检测策略
- 修改次数
- 是否允许补交

Validation:

- 标题必填。
- 截止时间晚于开始时间。
- `min_words >= 0`。
- `max_words` 若存在则大于 `min_words`。
- `revision_limit >= 0`。

## 11. 教师写作提交列表

`WritingSubmissionsPage.tsx`

表格列：

- 学生。
- 状态。
- 最新版本号。
- 字数。
- 语法问题数。
- 总停留时长。
- 总离开时长。
- 离开次数。
- 违规次数。
- 操作：查看详情。

## 12. 教师写作提交详情

`WritingReviewPage.tsx`

展示：

- 学生信息。
- 版本切换。
- 当前版本正文。
- 语法问题高亮和列表。
- 停留/离开时间线。
- 违规事件表。

教师页面不启用复制粘贴拦截。

