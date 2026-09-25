# Impromptu 写作模块产品与技术规格

## 1. 项目目标

本文档描述在现有 `D:\AFrontend\XQL` 随机口语训练系统上新增“写作作业”模块的完整产品需求、用户流程、系统设计、数据模型、接口契约、前后端实现规格、测试与开发计划。

目标不是重新设计现有系统，而是：

- 补齐现有系统已经实现但未集中文档化的产品能力。
- 将“写作作业 + 首次提交后语法标注 + 教师策略控制 + 页面停留/离开追踪 + 禁止复制粘贴”收敛为一套唯一、明确、可编码、可验收的软件规格。
- 让后续 Coding Agent 只阅读本目录即可开始实现，不需要重新进行产品决策。

## 2. Scope

本次范围：

1. 教师创建、发布、关闭写作作业。
2. 学生进入写作页面，自动保存草稿，首次提交后按教师配置进行语法问题标注。
3. 语法检测只标位置和类别，不给出正确写法。
4. 学生可按教师设置进行有限次修改和再次提交。
5. 记录学生进入/离开写作页面、停留时长、离开时长。
6. 在写作页面阻止普通复制、剪切、粘贴、右键、拖拽，并记录拦截尝试。
7. 教师查看学生提交版本、语法问题和行为记录。

本次不改变现有随机口语训练状态机和已有业务行为。

## 3. 现有系统基线

现有系统是 React 19 + Vite + TypeScript 前端，FastAPI + SQLAlchemy 2.0 + PostgreSQL 后端，包含学生、教师、管理员三角色、班级、题库、口语任务、训练状态机、录音、OSS 存储、AI 题库导入和教师评价。

关键真实源码：

- 后端模型：`backend/app/models/entities.py`
- 后端路由：`backend/app/api/router.py`
- 训练服务：`backend/app/services/training.py`
- AI 导入服务：`backend/app/services/topic_import.py`
- 前端路由：`frontend/src/routes/AppRoutes.tsx`
- 前端导航：`frontend/src/components/layout/AppShell.tsx`
- 学生训练页：`frontend/src/pages/student/TrainingPage.tsx`

## 4. 推荐阅读顺序

1. `product/existing-product.md`
2. `product/requirements.md`
3. `product/use-cases.md`
4. `product/user-flows.md`
5. `design/system-architecture.md`
6. `design/data-model.md`
7. `design/api-design.md`
8. `design/backend-design.md`
9. `design/frontend-design.md`
10. `engineering/implementation-plan.md`
11. `engineering/test-plan.md`
12. `engineering/acceptance-criteria.md`
13. `engineering/traceability.md`
14. `decisions/ADR-001-independent-writing-module.md`
15. `decisions/ADR-002-server-side-llm-grammar-check.md`

## 5. Source of Truth

以下信息只在一个文件中定义，其他文件引用，不重复完整定义：

| 信息 | 唯一来源 |
| --- | --- |
| 产品目标、范围、需求编号 | `product/requirements.md` |
| 现有产品功能基线 | `product/existing-product.md` |
| 用户场景和分支 | `product/use-cases.md` |
| 核心用户流程和 Mermaid | `product/user-flows.md` |
| 系统架构和模块职责 | `design/system-architecture.md` |
| 数据模型、字段、状态机 | `design/data-model.md` |
| API Contract | `design/api-design.md` |
| 后端实现规格 | `design/backend-design.md` |
| 前端实现规格 | `design/frontend-design.md` |
| 开发任务顺序 | `engineering/implementation-plan.md` |
| 测试策略 | `engineering/test-plan.md` |
| 验收标准 | `engineering/acceptance-criteria.md` |
| 需求到设计/任务/验收的追踪 | `engineering/traceability.md` |
| 关键技术决策 | `decisions/*.md` |
