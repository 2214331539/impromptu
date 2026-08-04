# 声场 · 随机口语训练器

面向学生与教师的 Web 口语训练系统。教师维护班级、题库和训练任务，学生随机抽题后完成服务端计时的准备与演讲，浏览器录音上传后由教师进行五维评价。

## 功能

- 学号/工号 + 密码注册登录，JWT 鉴权与学生/教师角色权限
- 班级创建、邀请码加入、学生名单与训练统计
- 题库和题目增删改、启停、分类/难度/标签搜索
- 训练任务草稿、发布、关闭、时间与重抽/重录规则
- 后端随机抽题、抽题记录、次数限制与最终题目锁定
- 服务端 UTC 阶段结束时间，刷新或切换标签后准确恢复倒计时
- 准备笔记自动保存、状态反馈与提交后锁定
- `getUserMedia` + `MediaRecorder` 录音、实时音量、本地回放、上传失败重试
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
│       ├── pages/            学生、教师和认证页面
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
│   │   ├── storage/          预留存储边界
│   │   └── main.py
│   ├── tests/                核心 API 与状态机测试
│   └── uploads/              本地录音文件
├── docker-compose.yml
└── .env.example
```

训练状态机为 `drawing -> preparing -> speaking -> review -> submitted`。每次读取会话时，后端根据 `preparation_ends_at` / `speaking_ends_at` 与当前 UTC 时间校准阶段；前端的每秒刷新只负责显示，不是计时事实来源。

## Docker 启动

要求 Docker Desktop 与 Docker Compose。

Windows 下可直接双击根目录的 `start.bat` 一键启动。脚本会自动检查 Docker Desktop、构建并启动三个服务，等待后端健康检查通过后打开前端页面；也可以右键使用 PowerShell 执行 `start.ps1`。

```powershell
Copy-Item .env.example .env
docker compose up --build
```

首次启动会自动执行 Alembic 迁移和幂等种子脚本。

- Web：http://localhost:5173
- API：http://localhost:8000
- OpenAPI：http://localhost:8000/docs
- PostgreSQL：`localhost:5432`

若端口已被占用，可在 `.env` 同时调整 `BACKEND_PORT`、`FRONTEND_PORT` 和 `VITE_API_URL`，例如将后端改为 `8001` 时，`VITE_API_URL` 应设为 `http://localhost:8001/api/v1`。

停止服务：

```powershell
docker compose down
```

如需同时清空本地数据库卷：

```powershell
docker compose down -v
```

## 本地开发

先启动 PostgreSQL：

```powershell
docker compose up -d postgres
```

后端（Python 3.12+）：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL="postgresql+psycopg://speaking:speaking_local@localhost:5432/speaking_lab"
$env:JWT_SECRET="local-development-secret-change-me-now"
alembic upgrade head
python -m app.db.seed
uvicorn app.main:app --reload --port 8000
```

前端：

```powershell
cd frontend
npm install
$env:VITE_API_URL="http://localhost:8000/api/v1"
npm run dev
```

浏览器麦克风 API 需要安全上下文；`localhost` 可直接使用，部署环境必须配置 HTTPS。

## 开发账号

仅用于本地种子数据：

| 角色 | 学号/工号 | 密码 |
| --- | --- | --- |
| 教师 | `T1001` | `teacher123` |
| 学生 | `S2025001` | `student123` |
| 学生 | `S2025002` | `student123` |

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

浏览器录音会先使用 WebM/OGG 等浏览器原生格式采集，后端在上传时通过 FFmpeg 统一转换为 AAC 音频封装的 MP4。训练结果、历史记录和教师评价页提供的下载链接均固定为 `.mp4`；Docker 镜像已内置 FFmpeg。

后端测试覆盖角色权限、随机抽题与重抽限制、题目确认锁定、倒计时阶段恢复、录音上传与幂等提交、教师评价。录音上传允许 WebM、OGG、M4A、MP3 和 WAV，默认上限为 20 MB，可通过 `UPLOAD_MAX_MB` 调整。
