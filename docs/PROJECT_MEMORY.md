# XQL / Impromptu 项目记忆

阅读与验证日期：2026-09-24。项目位置：`D:\AFrontend\XQL`。

本文记录当前工作区的源码事实、业务约束、开发入口与待核对事项，供后续开发快速恢复上下文。它是可更新的项目笔记，不代替产品规格；发生冲突时，应区分产品期望与代码实际行为。

**后续更新（2026-09-24）：** 已实现批量追加题目、两类任务编辑/关闭/重开、账号隔离的本机缓存与恢复、写作离开提醒、首页加入班级与任务同步。最新行为和验证结果见 `docs/changes-2026-09-24.md`。下文为初次阅读基线，其中“草稿无持久缓存”“修改期间仍显示语法提示”“最终提交重试 409”等问题已经在本次调整中处理。测试基线现为 26 个通过。

## 1. 产品与当前阶段

产品名为 **Impromptu（随机口语训练器）**，是学生、教师、管理员使用的教学 Web 平台。代码目录虽名为 XQL，但并非只有前端。

- 学生：邮箱验证注册、登录、找回密码、加入班级、完成口语训练、查看评价，以及完成写作作业。
- 教师：管理班级、题库和口语任务，查看录音并评分；创建写作作业，查看提交版本、语法标注和行为记录。
- 管理员：独立登录入口，管理账号启停、密码、邮箱、教师分配及全校班级。
- 个人资料页支持账号相关维护。

读取时分支为 `master`，HEAD 为 `c7d772a`（增加个人页面管理）。进入项目时已有 11 个已跟踪文件的修改，以及写作服务、页面、迁移、测试、规格和启动脚本等未跟踪内容。这些是既有工作，不能当作本次阅读产生的修改，也不能随意清理。

写作模块已存在实际前后端实现，并通过当前基础测试，但尚不能据此认定所有规格验收完成。根 README 的产品介绍仍主要围绕口语功能；理解当前项目必须同时阅读写作源码与 `docs/spec/`。

## 2. 技术栈和架构

| 层次 | 当前方案 |
| --- | --- |
| 前端 | React 19、TypeScript 5.8、Vite 7、React Router 7 |
| 数据与状态 | TanStack React Query 5；Zustand 5 管理认证及口语临时草稿 |
| 表单与样式 | React Hook Form、Zod 4、Tailwind CSS 3.4、Lucide 图标、自建公共组件 |
| 后端 | Python，Docker 基于 3.12；FastAPI 0.116.1、Pydantic Settings、SQLAlchemy 2.0.41 |
| 数据库 | PostgreSQL，Compose 使用 16；Alembic 迁移；测试使用内存 SQLite |
| 安全 | JWT（PyJWT）、Argon2 密码哈希、后端角色依赖和业务归属校验 |
| 外部依赖 | 阿里云 SMTP、阿里云 OSS、OpenAI-compatible Chat Completions 服务 |
| 媒体与部署 | 浏览器 MediaRecorder、FFmpeg、Docker Compose、Nginx HTTPS |

整体为单体后端 + React SPA，没有引入 Redis、Celery、消息队列或独立写作微服务。

主要调用链：页面 → `api/client.ts` → `/api/v1` 路由 → services → repositories / ORM → 数据库。路由负责参数与权限依赖，服务层处理业务规则和事务，仓储集中查询和关系加载。

后端 SQLAlchemy 使用同步 Session，`expire_on_commit=False`。服务中显式提交事务；部分状态操作通过 `for_update` 查询锁定记录。业务错误统一为 `AppError`，响应结构是 `{ error: { code, message } }`。

## 3. 核心业务规则

### 口语训练

状态流为：

```text
mic_check → drawing → researching → preparing → speaking → review → submitted
```

- 一个学生在一个口语任务下只有一条训练会话。
- 试音后才能抽题；后端负责随机选择、记录抽题历史和限制次数；确认后锁定题目。
- 默认资料搜集为 900 秒。README 描述常用流程为搜集 15 分钟、整理 1 分钟、演讲 3 分钟；具体时长由任务配置决定。
- 阶段时间由服务端 UTC 时间控制，响应携带 `server_time`，前端校准倒计时。
- 搜集超时由服务端 reconcile 进入整理；整理时间归零不会自动开始录音，必须由学生主动开始演讲。
- 演讲到时进入 review，录音上传后选择录音提交；提交锁定笔记。
- 重抽与重录限制表示首次之外的额外机会。
- 教师五维评价：内容准确性、逻辑结构、流利度、词汇、时间控制，各 0–20 分，总分 100。
- `notes_required` 字段存在，但现有测试明确包含“不要求准备笔记也可提交”，后续不要仅凭字段名推断强制行为。

前端录音直接使用原始麦克风流，AudioContext 用于音量监测；保存优选设备并优先选择物理输入。浏览器录音 blob 和失败待上传内容保存在页面内存，不能把服务端状态恢复理解为未上传录音也能跨刷新恢复。

上传会校验大小、MIME 与文件签名。FFmpeg 将音频转为 MP4/AAC；OSS 模式要求转码成功，本地模式在无法转码时可暂存原格式。旧本地录音下载时可能再转码。播放与下载的业务接口检查学生本人或任务教师身份。

### 写作作业

写作与口语独立建模，共享账号、班级、权限和数据库。

- 作业状态：`draft / published / closed`。
- 提交状态：`drafting / revising / finalized`。
- 检测策略：`off / after_submit`。
- 检测状态：`not_applicable / pending / completed / failed`。
- 一个学生在一个写作作业下只有一条提交主记录；每次正式提交形成独立内容快照。
- 初稿版本编号为 0。`revision_limit=1` 意味着初稿后还能再次提交 1 次，共 2 个版本。
- 编辑器为原生 textarea，草稿输入后约 1200 ms 防抖保存。
- 字数由前后端工具计算：基本汉字逐字计数，英文/数字按匹配到的词计数。
- 启用检测时，先持久化正式版本，再同步调用语法服务；检测失败可保留提交并标为 failed，提供重试入口。
- AI 只返回分段内位置与类别；后端转换全局偏移、限制范围、去重，展示固定中文类别提示，不输出正确改法。
- AI 参数复用 `OPENAI_MODEL / OPENAI_BASE_URL / OPENAI_API_KEY`。写作检测默认超时 60 秒、字符上限 12000。
- 页面每 10 秒发送心跳，隐藏、离开和 pagehide 上报离开；服务端默认 30 秒心跳超时后估算结束时间。
- 普通 copy/cut/paste/drop/contextmenu 及 Ctrl/Cmd+C/X/V 被页面拦截，同类违规上报节流 5 秒。该机制不是绝对防作弊承诺。
- 教师详情页读取版本、语法问题、停留区间、离开时长和违规记录；不包含自动写作评分或抄袭检测。

## 4. 数据模型地图

所有 ORM 模型集中于 `backend/app/models/entities.py`。

| 领域 | 模型 |
| --- | --- |
| 账号与验证码 | User、EmailCode |
| 班级 | ClassRoom、ClassMember |
| 题库 | TopicBank、Topic |
| 口语任务与过程 | TrainingTask、TrainingSession、TopicDrawRecord、TrainingNote |
| 录音与评价 | Recording、Evaluation |
| 写作 | WritingAssignment、WritingSubmission、WritingRevision、WritingGrammarIssue、WritingPresenceVisit、WritingIntegrityEvent |

注意 `WritingSubmission.latest_revision_id` 与 `WritingRevision.submission_id` 构成关联环；管理员删除账号时已有专门写作清理逻辑，扩展删除功能时需要一起考虑。

当前文件中的 Alembic 链：初始 schema → admin role → research phase → recording storage/student IDs → email verification → writing module。最新迁移文件 revision 为 `7f4c3b2a91d5`，父 revision 为 `f3d2b8a91c44`。本次没有对实际数据库执行迁移。

## 5. 开发入口索引

| 工作内容 | 优先阅读的文件（相对项目根目录） |
| --- | --- |
| 应用启动、跨域、异常挂载 | `backend/app/main.py`、`backend/app/core/config.py` |
| 后端 API 与角色权限 | `backend/app/api/router.py`、`backend/app/api/deps.py` |
| 数据结构与契约 | `backend/app/models/entities.py`、`backend/app/schemas/models.py`、`frontend/src/types/index.ts` |
| 数据访问 | `backend/app/repositories/repositories.py` |
| 认证、验证码、账号管理 | `backend/app/services/auth.py`、`email.py`、`admin.py` |
| 班级、题库、口语任务 | `backend/app/services/catalog.py`、`tasks.py` |
| AI 导入题库 | `backend/app/services/topic_import.py`、`frontend/src/features/topics/AiTopicImportModal.tsx` |
| 口语状态机、录音、评分 | `backend/app/services/training.py`、`backend/app/storage/oss.py` |
| 写作服务 | `backend/app/services/writing.py`、`writing_grammar.py`、`writing_presence.py` |
| 前端入口和路由 | `frontend/src/main.tsx`、`frontend/src/routes/AppRoutes.tsx` |
| 导航与公共布局 | `frontend/src/components/layout/AppShell.tsx` |
| 网络、媒体请求 | `frontend/src/api/client.ts` |
| 学生口语流程 | `frontend/src/pages/student/TrainingPage.tsx`、`frontend/src/hooks/useRecorder.ts`、`useCountdown.ts` |
| 学生写作流程 | `frontend/src/pages/student/WritingPage.tsx`、`WritingListPage.tsx`、`WritingTaskDetailPage.tsx` |
| 写作页面行为 | `frontend/src/hooks/useWritingPresence.ts`、`useAntiCopyPaste.ts` |
| 教师写作管理 | `frontend/src/pages/teacher/WritingAssignmentsPage.tsx`、`WritingAssignmentCreatePage.tsx`、`WritingSubmissionsPage.tsx`、`WritingReviewPage.tsx` |
| 样式系统 | `frontend/src/styles/globals.css`、`frontend/tailwind.config.js` |
| 产品和技术规格 | `docs/spec/README.md`，按其索引查阅 product/design/engineering/decisions |

前端路由以 `/app`（学生）、`/teacher`（教师）、`/admin`（管理员）区分，公共个人页为 `/profile`。普通认证入口是 `/login` 和 `/register`，管理员入口是 `/admin/login`。

认证 token 与用户数据存于 localStorage 的 `speaking-lab-token` 和 `speaking-lab-user`。前端守卫用于导航，真正鉴权由后端完成。React Query 全局默认 staleTime 为 20 秒、查询重试 1 次、窗口聚焦重新获取、mutation 不自动重试。

现有 UI 使用浅灰底、白色圆角面板、深色文字和蓝色强调色；公共组件在 `components/common/`。保持现有设计令牌和组件风格可减少不一致。

## 6. 本地启动和部署

根目录 `.env` 提供运行配置，`Settings` 明确从项目根读取；不应把实际密钥或账号密码抄入项目记忆。本次未读取真实 `.env` 内容。

本地统一入口：双击根目录 `start.bat`（调用 `start.ps1`）。原有四个前后端独立启动脚本已删除。统一脚本准备依赖、检查本地数据库、执行 Alembic，按 `SEED_DEMO_DATA` 初始化数据，启动 uvicorn 和 Vite，等待双方 HTTP 就绪后打开浏览器。按回车或 Ctrl+C 停止双方；日志位于 `.local/logs/`。数据库和角色需预先建立，端口冲突报错，不自动杀其他进程。支持 `-CheckOnly`、`-NoBrowser`、`-SmokeTest` 和 `-EnvFile`。

**端口存在不同默认来源，不能只记一个数字：**

- README 当前示例为前端 5174、后端 8002。
- 统一启动脚本缺省为前端 5174、后端 8002，实际由 `.env` 覆盖。
- `vite.config.ts` 默认 5173，`/api` 代理目标为 localhost:8000。
- Compose 后端内部为 8000，前端内部为 80；宿主端口由环境变量控制。
- `VITE_API_URL` 应用缺省为 `/api/v1`；统一启动脚本按实际端口自动设置 API 地址和 CORS。

生产结构为外层 Nginx HTTPS → Docker 前端 Nginx → 后端 API；配置在 `deploy/nginx/impromptu.conf`、`frontend/nginx.conf`、`docker-compose.yml`。Docker 后端启动命令包含迁移，可按开关创建演示数据。`update.sh` 用于服务器拉取、构建、重启和健康检查。

## 7. 阅读时确认的差异与后续核对点

以下是源码阅读发现，不代表本次做了完整缺陷审计，也未在本次修改业务代码：

1. **修改期间的语法提示：** 规格 FR-006 要求修改未提交时隐藏提示；`WritingPage.tsx` 当前持续展示上次提交结果，未以当前正文是否变化来隐藏。
2. **草稿本地恢复：** 规格要求本地暂存；写作页当前使用 React state 和服务端防抖保存，没有持久化到 localStorage/IndexedDB。未成功保存的内容不能保证刷新后恢复。
3. **截止与最终状态：** 后端会拒绝不允许迟交的过期保存/提交，但所读代码未见截止时自动把 submission 改为 finalized；前端只按 finalized 控制只读。不要把“API 拒绝编辑”与“状态及 UI 自动锁定”混为一谈。
4. **最终提交的幂等性：** `WritingService.submit` 先检查 finalized，后检查 `client_submit_id`；最终提交成功后使用同一个 ID 重试会先遇到 409。前端每次 mutation 生成新 ID，跨请求重试策略仍需核对。
5. **测试日期固定：** 写作测试的任务时间写死为 2026-09-17 至 2026-09-30，未来跑测可能因日期失效而失败。
6. **录音访问边界：** 业务 stream/download 接口有归属校验，但 `main.py` 还直接挂载 `/uploads` 静态目录；本地文件的直接访问边界需在安全审查时单独确认。
7. **前端包大小：** 所有页面由路由文件静态导入；本次构建主 JS 为 553.39 kB（gzip 159.50 kB），触发 500 kB 提示，logo 约 1.39 MB。性能优化时可检查拆包与图片体积。

## 8. 本次验证基线

2026-09-24，在已有依赖环境执行：

```powershell
# D:\AFrontend\XQL\backend
.\.venv\Scripts\python.exe -m pytest
# 21 passed in 20.70s

# D:\AFrontend\XQL\frontend
npm run build
# tsc -b 与 vite build 均通过；仅包体积提示
```

后端共 17 个核心流程测试和 4 个写作测试。测试使用内存 SQLite、临时上传目录，并 mock 邮件及相关外部服务调用；这不等价于 PostgreSQL 迁移、真实 AI、SMTP、OSS 或浏览器录音已完成端到端验证。本次未启动应用、未执行数据库迁移、未访问线上服务。

本次仅新增本项目记忆文档，保留进入时的业务代码改动。后续接手时，先读本文，再查相关源码和规格，并重新检查 Git 状态及验证结果是否仍有效。
