# 现有产品功能设计

本文根据当前 `D:\AFrontend\XQL` 源码整理，作为新增写作模块的现有系统基线，不是重新设计。

## 1. 产品定位

当前产品是面向学生、教师和系统管理员的随机口语训练 Web 系统。管理员维护教师账号和班级，教师维护题库和口语任务，学生完成随机抽题、资料搜集、草稿整理、限时录音和提交，教师进行五维评价。

## 2. 角色与权限

| 角色 | 主要能力 |
| --- | --- |
| Student | 注册、邮箱验证、加入班级、查看任务、完成口语训练、查看历史和评价 |
| Teacher | 创建班级、管理题库、创建/发布/关闭任务、查看提交、发布评价 |
| Admin | 管理员登录、创建/启停教师和账号、管理全校班级 |

权限实现：

- JWT 鉴权。
- `Student`、`Teacher`、`Admin` 三类 FastAPI 依赖。
- 前端 React Router 角色路由守卫。

## 3. 认证与账号

现有能力：

- 学生开放注册，必须完成邮箱验证码验证。
- 教师和管理员账号由管理员统一创建。
- 学生/教师/管理员使用账号 + 密码登录。
- 管理员有独立登录入口 `/admin/login`。
- 支持通过绑定邮箱验证码找回密码。
- 支持邮箱绑定和修改密码。
- 管理员可启停账号、重置学生/教师密码、删除账号。

相关源码：

- `backend/app/services/auth.py`
- `backend/app/services/admin.py`
- `backend/app/services/email.py`

## 4. 班级管理

现有能力：

- 教师创建班级，系统生成 6 位邀请码。
- 学生通过邀请码加入班级。
- 教师查看班级学生名单和统计。
- 教师可移除班级学生。
- 管理员可统一管理全校班级。

相关源码：

- `backend/app/services/catalog.py`
- `backend/app/services/admin.py`
- `backend/app/models/entities.py` 中的 `ClassRoom`、`ClassMember`

## 5. 题库与题目

现有能力：

- 教师创建题库。
- 教师新增、编辑、停用/启用、删除口语题目。
- 题目包含英文 prompt、分类、难度、标签。
- 支持按分类、难度、关键词筛选。
- 支持 AI 从粘贴文本或 Excel/CSV/TXT 提取题库草稿。
- 被口语任务引用的题库不能删除；被训练记录引用的题目会改为停用而不是硬删除。

相关源码：

- `backend/app/services/catalog.py`
- `backend/app/services/topic_import.py`
- `frontend/src/pages/teacher/TopicsPage.tsx`

## 6. 口语任务管理

现有能力：

- 教师创建口语训练任务。
- 设置目标班级、题库、资料搜集时长、准备整理时长、演讲时长。
- 设置开始时间、截止时间。
- 设置重新抽题次数、重新录制次数。
- 设置是否允许提前结束准备。
- 任务状态为草稿、已发布、已关闭。

相关源码：

- `backend/app/services/tasks.py`
- `backend/app/models/entities.py` 中的 `TrainingTask`
- `frontend/src/pages/teacher/TaskCreatePage.tsx`
- `frontend/src/pages/teacher/TasksPage.tsx`

## 7. 口语训练状态机

现有状态机：

```text
mic_check -> drawing -> researching -> preparing -> speaking -> review -> submitted
```

行为：

- 学生进入已发布且未截止的任务。
- 完成麦克风试音后进入随机抽题。
- 抽题可受 `redraw_limit` 限制，确认后锁定最终题目。
- 确认题目后进入资料搜集阶段。
- 资料搜集结束后进入草稿整理阶段。
- 学生主动开始演讲和录音。
- 录音结束后进入 review。
- 学生选择录音并提交。
- 提交后笔记锁定。

服务端根据 UTC 截止时间恢复状态，刷新或切换标签页不会重置。

相关源码：

- `backend/app/services/training.py`
- `backend/app/models/entities.py` 中的 `TrainingSession`
- `frontend/src/pages/student/TrainingPage.tsx`

## 8. 录音与存储

现有能力：

- 使用 `getUserMedia` 和 `MediaRecorder` 录音。
- 实时音量展示。
- 本地回放。
- 上传失败可重试。
- 后端将浏览器音频转换为 MP4/AAC。
- 支持本地存储和阿里云 OSS。
- 播放和下载通过鉴权接口代理。
- 录音访问只允许学生本人和任务教师。

相关源码：

- `frontend/src/hooks/useRecorder.ts`
- `backend/app/services/training.py`
- `backend/app/storage/oss.py`

## 9. 学生训练历史与教师评价

现有能力：

- 学生查看训练历史。
- 学生回听录音，查看教师五维评分和文字反馈。
- 教师查看任务提交列表。
- 教师对录音进行五维评价：
  - 内容准确性
  - 逻辑结构
  - 表达流利度
  - 词汇使用
  - 时间控制
- 每项满分 20，总分 100。
- 教师可更新已发布评价。

相关源码：

- `frontend/src/pages/student/HistoryPage.tsx`
- `frontend/src/pages/teacher/SubmissionsPage.tsx`
- `frontend/src/pages/teacher/EvaluationPage.tsx`
- `backend/app/services/training.py`

## 10. AI 题库导入

现有能力：

- 教师粘贴非结构化文本，或上传 `.xlsx`、`.csv`、`.tsv`、`.txt`。
- 后端调用 OpenAI-compatible Chat Completions API。
- AI 只提取主题列表，不生成分类、标签、扩展题目或解释。
- 教师确认前可增删改主题。

相关源码：

- `backend/app/services/topic_import.py`
- `frontend/src/features/topics/AiTopicImportModal.tsx`

## 11. 部署与存储

现有能力：

- 本地 Windows 一键启动。
- Docker Compose 部署。
- Nginx HTTPS 配置。
- 阿里云邮件推送验证码。
- 阿里云 OSS 录音存储。
- 服务器更新脚本。

## 12. 现有业务约束

- 学生不能看到草稿任务。
- 学生只能访问自己所在班级任务。
- 教师只能管理自己的班级、题库和任务。
- 口语任务发布后不能恢复为草稿。
- 录音文件必须通过鉴权接口访问。
- 浏览器麦克风 API 需要 HTTPS。

