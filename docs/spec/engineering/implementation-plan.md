# 开发计划

## 0. 执行原则

- 按 Phase 顺序执行。
- 每个 Task 完成、测试、提交后再开始下一个。
- 不修改现有口语训练行为。
- 所有表、API、页面字段以本目录文档为准。

## Phase 0 — 基线确认

### TASK-000 确认当前测试通过

Files:
- `backend/tests/test_core_flow.py`
- `frontend/package.json`

Depends on:
None

Acceptance:
- `cd backend && pytest` 通过。
- `cd frontend && npm run typecheck && npm run build` 通过。

## Phase 1 — 数据层

### TASK-001 增加写作枚举和 ORM 模型

Files:
- `backend/app/models/entities.py`

Depends on:
TASK-000

Acceptance:
- 新增 6 张写作相关表的模型。
- 新增所有枚举。
- `python -c "from app.models.entities import WritingAssignment"` 成功。

### TASK-002 增加 Alembic migration

Files:
- `backend/alembic/versions/xxxx_add_writing_module.py`

Depends on:
TASK-001

Acceptance:
- `alembic upgrade head` 成功。
- `alembic downgrade -1` 成功。
- 不修改现有口语表。

### TASK-003 增加写作 Pydantic schema

Files:
- `backend/app/schemas/models.py`

Depends on:
TASK-001

Acceptance:
- 所有 `data-model.md` 和 `api-design.md` 中列出的 schema 存在。
- datetime 和字段校验符合文档。

### TASK-004 增加 WritingRepository

Files:
- `backend/app/repositories/repositories.py`

Depends on:
TASK-001

Acceptance:
- 查询方法可加载 assignment/submission/revision/visit。
- 没有 N+1 的明显关系加载问题。

## Phase 2 — 外部服务与配置

### TASK-005 增加写作配置

Files:
- `backend/app/core/config.py`

Depends on:
TASK-000

Acceptance:
- 增加：
  - `writing_grammar_timeout_seconds`
  - `writing_grammar_max_chars`
  - `writing_presence_heartbeat_timeout_seconds`

### TASK-006 实现语法检测 Provider

Files:
- `backend/app/services/writing_grammar.py`

Depends on:
TASK-003, TASK-005

Acceptance:
- 输入文本，返回规范化问题列表。
- 分段正确。
- 校验和换算 global offset。
- 非法 AI 响应抛出可识别错误。

## Phase 3 — 后端业务与 API

### TASK-007 实现 WritingService

Files:
- `backend/app/services/writing.py`

Depends on:
TASK-004, TASK-006

Acceptance:
- 创建/获取提交。
- 保存草稿。
- 提交版本和状态机。
- 字数计算。
- 教师聚合。

### TASK-008 实现 WritingPresenceService

Files:
- `backend/app/services/writing_presence.py`

Depends on:
TASK-004, TASK-005

Acceptance:
- enter/heartbeat/leave/reconcile/summary 符合文档。

### TASK-009 注册写作路由

Files:
- `backend/app/api/router.py`

Depends on:
TASK-007, TASK-008

Acceptance:
- 所有 `/writing/*` API 存在。
- 学生/教师权限正确。

### TASK-010 处理管理员删除联动

Files:
- `backend/app/services/admin.py`

Depends on:
TASK-001, TASK-009

Acceptance:
- 删除教师/学生时写作数据正确清理。

## Phase 4 — 前端基础

### TASK-011 增加写作类型和路由

Files:
- `frontend/src/types/index.ts`
- `frontend/src/routes/AppRoutes.tsx`
- `frontend/src/components/layout/AppShell.tsx`

Depends on:
TASK-009

Acceptance:
- 学生/教师导航可见写作入口。
- 路由守卫正确。

### TASK-012 实现复制粘贴拦截 Hook

Files:
- `frontend/src/hooks/useAntiCopyPaste.ts`

Depends on:
TASK-011

Acceptance:
- 阻止 copy/cut/paste/drop/contextmenu 和快捷键。
- 节流上报。

### TASK-013 实现页面停留追踪 Hook

Files:
- `frontend/src/hooks/useWritingPresence.ts`

Depends on:
TASK-011

Acceptance:
- 进入、心跳、离开、visibilitychange 和 pagehide 行为正确。

## Phase 5 — 前端页面

### TASK-014 学生写作列表和详情

Files:
- `frontend/src/pages/student/WritingListPage.tsx`
- `frontend/src/pages/student/WritingTaskDetailPage.tsx`

Depends on:
TASK-011

Acceptance:
- 学生可见已发布任务。
- 可进入或继续写作。

### TASK-015 学生写作页面

Files:
- `frontend/src/pages/student/WritingPage.tsx`
- 可能新增 `frontend/src/components/writing/GrammarIssuePanel.tsx`

Depends on:
TASK-012, TASK-013, TASK-014

Acceptance:
- 草稿编辑、自动保存。
- 首次提交前不显示语法问题。
- 首次提交后显示问题高亮和修改入口。
- final 状态锁定。

### TASK-016 教师写作页面

Files:
- `frontend/src/pages/teacher/WritingAssignmentsPage.tsx`
- `frontend/src/pages/teacher/WritingAssignmentCreatePage.tsx`
- `frontend/src/pages/teacher/WritingSubmissionsPage.tsx`
- `frontend/src/pages/teacher/WritingReviewPage.tsx`

Depends on:
TASK-011, TASK-015

Acceptance:
- 教师可创建、发布、关闭。
- 可查看提交、版本、语法问题、停留/离开和违规记录。

## Phase 6 — 测试与验收

### TASK-017 后端写作模块测试

Files:
- `backend/tests/test_writing_flow.py`

Depends on:
TASK-009

Acceptance:
- 覆盖 `test-plan.md` 中列出的核心用例。

### TASK-018 前端静态检查

Files:
- 前端源码。

Depends on:
TASK-016

Acceptance:
- `npm run typecheck` 通过。
- `npm run build` 通过。

### TASK-019 全量回归

Depends on:
TASK-017, TASK-018

Acceptance:
- 现有口语测试仍通过。
- 新写作测试通过。
- 前端 build 通过。

