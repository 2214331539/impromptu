# Impromptu · 随机口语训练器

面向学生、教师与系统管理员的 Web 口语训练系统。管理员统一维护教师账号和班级，教师维护题库与训练任务；学生依次完成麦克风试音、随机选题、资料搜集、草稿整理、录音演讲和提交，再由教师进行五维评价。

## 功能

- 学生开放注册，教师与管理员账号由系统管理员统一创建
- 独立管理员登录、账号启停、教师分配与全校班级管理
- 学号/工号 + 密码登录，JWT 鉴权与学生/教师/管理员角色权限
- 班级创建、邀请码加入、学生名单与训练统计
- 题库和题目增删改、启停、分类/难度/标签搜索
- 训练任务草稿、发布、关闭、时间与重抽/重录规则
- 后端随机抽题、抽题记录、次数限制与最终题目锁定
- 服务端 UTC 阶段结束时间，刷新或切换标签后准确恢复资料搜集、准备整理和演讲倒计时
- 演讲草稿自动保存、状态反馈、演讲时只读提示与提交后锁定
- `getUserMedia` + `MediaRecorder` 录音、物理麦克风优先选择、实时音量、本地回放、上传失败重试
- 学生训练历史、录音回听、评分和文字反馈
- 教师提交列表、录音播放、五维评分和总评发布

## 技术结构

```text
.
├── frontend/                 React + TypeScript + Vite
│   └── src/
│       ├── api/              统一请求与媒体 URL
│       ├── components/       公共、布局、计时和训练组件
│       ├── hooks/            服务端倒计时与录音 Hook
│       ├── pages/            学生、教师、管理员和认证页面
│       ├── routes/           角色路由守卫
│       ├── stores/           认证与当前训练临时状态
│       ├── styles/           Design Tokens 与全局样式
│       ├── types/            API 类型
│       └── utils/            日期、时长和状态格式化
├── backend/
│   ├── alembic/              数据库迁移
│   ├── app/
│   │   ├── api/              路由与依赖注入
│   │   ├── core/             配置、安全与统一异常
│   │   ├── db/               Session、Base 与种子数据
│   │   ├── models/           SQLAlchemy 2.0 模型
│   │   ├── repositories/     数据访问
│   │   ├── schemas/          Pydantic 请求/响应
│   │   ├── services/         权限与业务事务
│   │   ├── storage/          本地与阿里云 OSS 存储适配器
│   │   └── main.py
│   ├── tests/                核心 API 与状态机测试
│   └── uploads/              历史本地录音与临时转码文件
├── docker-compose.yml
└── .env.example
```

训练状态机为 `mic_check -> drawing -> researching -> preparing -> speaking -> review -> submitted`。默认配置是试音通过后选题，确认题目后进行 15 分钟资料搜集，随后用 1 分钟整理演讲草稿，最后由学生主动开始 3 分钟正式录音。资料搜集结束由后端根据 `research_ends_at` 自动切入整理；整理倒计时归零后仍停留在 `preparing`，只有学生点击“开始演讲并录音”才会写入 `speaking_started_at` 和 `speaking_ends_at`。所有倒计时均根据服务端 UTC 截止时间校准，页面刷新不会重置时间。

## Docker 启动

要求 Docker Desktop 与 Docker Compose。

Windows 下可直接双击根目录的 `start.bat` 一键启动。脚本会自动检查 Docker Desktop、构建并启动三个服务，等待后端健康检查通过后打开前端页面；也可以右键使用 PowerShell 执行 `start.ps1`。

```powershell
Copy-Item .env.example .env
docker compose up --build
```

首次启动会自动执行 Alembic 迁移和幂等种子脚本。

- Web：http://localhost:5173
- 管理员登录：http://localhost:5173/admin/login
- API（经前端同源代理）：http://localhost:5173/api/v1
- OpenAPI（仅本机后端端口）：http://localhost:8000/docs
- PostgreSQL：仅在 Docker 内网提供，不映射宿主机端口

Docker 前端通过容器内 Nginx 将 `/api` 转发到后端，前后端宿主机端口均只绑定 `127.0.0.1`。生产环境由系统 Nginx 对外开放 80/443 并代理到 `FRONTEND_PORT`，浏览器不直接访问容器端口。若端口被占用，只需在 `.env` 调整 `BACKEND_PORT` 或 `FRONTEND_PORT`；`VITE_API_URL` 保持 `/api/v1`。

停止服务：

```powershell
docker compose down
```

如需同时清空本地数据库卷：

```powershell
docker compose down -v
```

## 本地开发

本地开发建议让 PostgreSQL 和后端继续运行在 Docker 内网：

```powershell
docker compose up -d postgres backend
```

查看后端日志和运行测试：

```powershell
docker compose logs -f backend
docker compose run --rm --no-deps backend pytest -q
```

前端：

```powershell
cd frontend
npm install
$env:VITE_API_URL="http://localhost:8000/api/v1" # 与 BACKEND_PORT 保持一致
npm run dev
```

浏览器麦克风 API 需要安全上下文；`localhost` 可直接使用，部署环境必须配置 HTTPS。

## OSS 连通性检查

OSS 参数统一保存在根目录 `.env`，真实 AccessKey 不得写入 `.env.example` 或提交到 Git。设置 `STORAGE_BACKEND=oss` 后，新上传录音会在临时目录完成 MP4 转码，再写入 `OSS_RECORDING_PREFIX` 指定的目录；历史本地录音保持原位置并继续兼容播放，不会被自动迁移。

配置好 `OSS_ENDPOINT`、`OSS_BUCKET_NAME`、`OSS_ACCESS_KEY_ID` 和 `OSS_ACCESS_KEY_SECRET` 后执行：

```powershell
docker compose build backend
docker compose run --rm --no-deps backend python scripts/test_oss_connection.py
```

脚本只会在 `OSS_TEST_PREFIX` 下创建一个随机 TXT 对象，读回并比对内容，然后删除并确认对象已不存在。输出 `"status": "ok"` 表示写入、读取和清理均成功。

## 开发账号

以下账号仅在 `SEED_DEMO_DATA=true` 时创建。生产环境必须设置为 `false`，并使用单独创建的管理员账号：

| 角色 | 学号/工号 | 密码 |
| --- | --- | --- |
| 系统管理员 | `A1001` | `admin123` |
| 教师 | `T1001` | `teacher123` |
| 学生 | `250001` | `student123` |
| 学生 | `250002` | `student123` |

种子数据还包含 1 个班级（邀请码 `SPEAK6`）、1 个含 15 道英文题目的题库、1 个进行中任务和 1 条带录音及评价的已完成记录。

## 验证

```powershell
cd backend
python -m pytest

cd ..\frontend
npm run typecheck
npm run build
```

### 录音格式说明

浏览器录音会先使用 WebM/OGG 等浏览器原生格式采集，后端在临时目录通过 FFmpeg 统一转换为 AAC 音频封装的 MP4，再上传到私有 OSS Bucket。播放和下载继续通过后端鉴权接口代理，不需要开放 Bucket 公共读权限。训练结果、历史记录和教师评价页提供的下载文件固定为 `.mp4`；Docker 镜像已内置 FFmpeg。

后端测试覆盖管理员账号管理、角色权限、学生注册限制、试音前置校验、随机抽题与重抽限制、题目确认锁定、资料搜集/准备/演讲状态机恢复、学生与教师录音访问、录音上传与幂等提交、教师评价。录音上传允许 WebM、OGG、M4A、MP3 和 WAV，默认上限为 20 MB，可通过 `UPLOAD_MAX_MB` 调整。
