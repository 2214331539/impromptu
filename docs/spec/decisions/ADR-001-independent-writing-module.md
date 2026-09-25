# ADR-001 新增独立写作模块，不扩展现有口语训练状态机

## Context

现有系统围绕口语训练设计，`TrainingTask`、`TrainingSession`、`SessionPhase`、`Recording`、`Evaluation` 共同表达一个口语训练流程。

新需求是写作作业，包含：

- 文本草稿。
- 提交版本。
- 首次提交后语法标注。
- 修改次数。
- 页面停留/离开追踪。
- 禁止复制粘贴。

如果将这些能力强行加入 `TrainingSession`，会引入大量只对写作有意义的字段，并增加现有口语状态机的判断复杂度。

## Decision

新增独立写作领域：

- `WritingAssignment`
- `WritingSubmission`
- `WritingRevision`
- `WritingGrammarIssue`
- `WritingPresenceVisit`
- `WritingIntegrityEvent`

新模块通过 `ClassRoom` 和 `User` 与现有系统关联，但不复用 `TrainingTask`、`TrainingSession`、`SessionPhase`。

## Reason

- 口语和写作的生命周期不同。
- 口语的核心对象是录音和题目，写作的核心对象是文本和版本。
- 保持现有口语表不被破坏，回归风险更低。
- 后端和前端都能形成清晰的领域边界。
- 未来如果要扩展写作评分、批注、导出，不影响口语训练。

## Rejected Alternatives

### 扩展现有 `TrainingTask` 和 `TrainingSession`

拒绝原因：

- 需要给口语模型增加大量可空字段。
- `SessionPhase` 状态机会被污染。
- 录音、抽题、笔记锁等逻辑要额外区分写作类型。
- 代码复杂度和回归风险明显增加。

### 建设完全独立的第二站点

拒绝原因：

- 用户要求在当前网站增加一个页面。
- 学生、教师、班级、JWT 需要复用。
- 独立站点会重复维护账号和班级数据。

## Consequences

正面：

- 写作和口语业务隔离。
- 现有口语功能回归影响小。
- 写作模块容易独立测试和演进。

负面：

- 新增约 6 张表和独立服务。
- 教师/学生导航需要增加入口。
- 管理员删除账号时要处理写作级联删除。

