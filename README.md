# Daily Canvas

极简每日创作分享平台

## 项目简介

Daily Canvas（每日画布）是一个极简的每日创作分享平台，用户每天可以在"画布"上分享一段文字、一句话、一个想法或小灵感。整体风格采用**留白美学**，强调内容本身。

## 技术栈

### 前端
- **Vite** - 构建工具
- **React 18** - 前端框架
- **TypeScript** - 类型安全
- **TailwindCSS** - 样式
- **React Query** - 服务端状态管理
- **React Hook Form** - 表单处理
- **React Router** - 路由管理

### 后端
- **FastAPI** - Python Web 框架
- **SQLAlchemy** - ORM
- **PostgreSQL** - 数据库
- **JWT** - 身份认证
- **Pydantic** - 数据验证

## 项目结构

```
daily-canvas/
├── docs/                     # 项目文档
│   ├── SPEC.md             # 项目规格说明
│   └── ...
├── frontend/                # 前端项目
│   ├── src/
│   │   ├── api/           # API 调用
│   │   ├── components/    # React 组件
│   │   ├── pages/         # 页面
│   │   ├── hooks/         # 自定义 Hooks
│   │   ├── types/         # TypeScript 类型
│   │   ├── context/       # React Context
│   │   └── ...
│   └── ...
└── backend/                 # 后端项目
    ├── app/
    │   ├── routers/        # API 路由
    │   ├── models/         # 数据库模型
    │   ├── schemas/        # Pydantic 模型
    │   ├── crud/           # 数据库操作
    │   ├── auth/           # 认证
    │   └── main.py         # 应用入口
    ├── requirements.txt
    └── ...
```

## 快速开始

### 前置要求

- Node.js >= 18
- Python >= 3.9
- PostgreSQL >= 13

### 1. 克隆项目

```bash
cd daily-canvas
```

### 2. 设置后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 复制环境变量配置
cp .env.example .env

# 生成 JWT 密钥（不要把输出提交到仓库）
openssl rand -hex 32
# 将输出填写到 .env 的 SECRET_KEY=

# 初始化数据库
python init_db.py

# 启动后端服务
uvicorn app.main:app --reload
```

后端服务将在 http://localhost:8000 启动

### 3. 设置前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端服务将在 http://localhost:3000 启动

### 4. 访问应用

打开浏览器访问 http://localhost:3000

## 功能特性

- [x] 用户注册和登录
- [x] JWT Token 认证
- [x] 无感登录（15 分钟 access token + 30 天 refresh token，自动续签）
- [x] 发布每日创作
- [x] 浏览时间线
- [x] 随机漫步探索
- [x] 情绪标签
- [x] 个人中心
- [x] 创作状态机（正常 / 仅自己可见 / 审核中 / 已隐藏 / 已删除，状态变化留痕）
- [x] 私密创作（仅自己可见，随时可切换，不计入公开统计）
- [x] 创作生命周期（发布后 24 小时内编辑内容，显示「已编辑」）
- [x] 软删除与回收站（30 天内恢复；删除不释放当天名额）
- [x] 本地草稿与补写（今天及前 3 天，补写内容带「补写」标记）
- [x] 举报（同一用户去重、24 小时上限 20 次、≥5 名不同用户举报自动进入待审）
- [x] 拉黑与屏蔽（单向记录、双向隔离、可随时解除）
- [x] 最小管理端（举报按对象聚合、处置留痕）
- [x] 登录暴力破解防护（账号维度失败锁定 + 宽松 IP 兜底，返回 429 与 `Retry-After`）
- [x] 关于页服务状态自查（查看当前服务地址与配置来源、检测服务、重新获取地址）
- [x] 安装失败原因转译（签名不一致 / 降级 / 空间不足 / 包损坏等给出可执行提示）

### 内容安全第一批（已落地）

产品和默认值：**严格每天一条**（公开或私密都占名额）、**举报 5 人进入待审**、
**私密内容不计入任何公开统计**。

| 能力 | 接口 |
| --- | --- |
| 发布时选择可见性 | `POST /api/posts`（body 增加 `visibility: public \| private`） |
| 补写最近 3 天 | `POST /api/posts`（body 增加 `post_date: YYYY-MM-DD`） |
| 查询指定日期是否已写 | `GET /api/posts/date/{date}` |
| 24 小时内编辑内容 | `PATCH /api/posts/{id}` |
| 软删除 / 回收站 / 恢复 | `DELETE /api/posts/{id}`、`GET /api/posts/trash`、`POST /api/posts/{id}/restore` |
| 随时切换可见性（不受 24 小时编辑窗口限制） | `PATCH /api/posts/{id}/visibility` |
| 今天的创作（发布页入口预防） | `GET /api/posts/today` |
| 状态变更历史（作者 / 管理端） | `GET /api/posts/{id}/status-history` |
| 举报创作（可同时拉黑作者） | `POST /api/posts/{id}/report` |
| 我的举报 | `GET /api/reports/me` |
| 拉黑 / 解除 / 已拉黑列表 | `POST`、`DELETE /api/users/{username}/block`，`GET /api/blocks/me` |
| 管理端 | `POST /api/staff/login`、`GET /api/staff/reports`、`PATCH /api/staff/reports/{id}`、`PATCH /api/staff/posts/{id}/status` |

所有公开入口（时间线、随机漫步、个人主页）统一复用 `content_safety.public_posts_query`，
只有 `status=normal` 且 `visibility=public`、且不涉及拉黑关系的内容才会出现；
非公开内容对非作者一律返回 404，不暴露「这条内容存在」。

#### 管理端账号

管理端账号不在代码里写死，也不提供默认口令。只有同时配置下面两个变量时，后端启动才会创建/更新该账号：

```bash
# .env
STAFF_USERNAME=moderator
STAFF_PASSWORD=<用 openssl rand -hex 12 生成>
```

随后用 `POST /api/staff/login` 换取管理端 token（`type=staff_access`，与普通用户 token 互不通用）。

#### 登录暴力破解防护

`/api/auth/login` 与 `/api/staff/login` 有失败次数限制，超限返回 `429` 并在 `Retry-After` 头给出等待秒数，
前端会把 429 显示为「操作过于频繁，已暂时限制尝试」。默认值（可用环境变量覆盖）：

```bash
LOGIN_MAX_FAILURES_PER_ACCOUNT=8      # 单账号 15 分钟内允许的密码错误次数，第 9 次锁定
LOGIN_MAX_FAILURES_PER_IP=200        # 来源 IP 兜底阈值；隧道下所有流量共用容器 IP，所以放得很高
LOGIN_WINDOW_SECONDS=900             # 统计窗口
LOGIN_LOCKOUT_SECONDS=900            # 单账号锁定时长
LOGIN_IP_LOCKOUT_SECONDS=300         # IP 维度锁定时长
REGISTER_MAX_ATTEMPTS_PER_IP=60      # 每来源 IP 每小时注册尝试次数（隧道下是全局计数，留足余量）
REGISTER_WINDOW_SECONDS=3600
REGISTER_LOCKOUT_SECONDS=600
```

当前是单 backend 容器 + 单进程 uvicorn，计数存在进程内存里，**重启后端会重置计数**；
将来横向扩容或正式上线域名时，需要改成 Redis 等共享存储实现。

## Docker 启动

```bash
# 第一次启动前先生成本地环境变量文件
cp .env.example .env
openssl rand -hex 32
# 将输出填写到 .env 的 SECRET_KEY=

docker compose up -d
```

`SECRET_KEY` 是必填项。未设置、仍使用默认值或少于 32 个字符时，后端会拒绝启动；
轮换密钥后，已签发的 access token 会失效，但 30 天 refresh token 仍有效，
客户端会自动静默续期，已有用户不需要重新登录（实测路径：`/auth/me 401` → `/auth/refresh 200` → `/auth/me 200`）。
PostgreSQL 端口只绑定 `127.0.0.1:5432`，不会直接暴露到局域网或公网。

默认访问：

- Web: `http://localhost:8080`
- API 健康检查: `http://localhost:8080/api/health`

## 回归测试

仓库自带一套端到端回归，覆盖五组契约（共 98 条断言）：

| 套件 | 覆盖内容 |
| --- | --- |
| `tests/e2e/test_content_safety.py` | 创作状态机、私密隔离、举报 5 人待审、我的举报、双向拉黑与幂等、最小管理端处置 |
| `tests/e2e/test_rate_limit.py` | 账号锁定（第 9 次 429 + `Retry-After`）、IP 兜底、注册刷号阈值 |
| `tests/e2e/test_post_lifecycle.py` | 24 小时编辑边界、补写 3 天窗口、软删除、30 天恢复、管理端强制删除边界 |
| `tests/e2e/test_auth_tokens.py` | 15 分钟 access / 30 天 refresh、刷新轮换、旧 refresh 复用被拒、登出撤销、401 契约 |
| `tests/e2e/test_health.py` | `/api/health` 存活、`/api/health/ready` 就绪（含数据库状态）、`X-Request-ID` |

```bash
bash tests/run-e2e-tests.sh
```

脚本会自动重启 backend（限流计数存在进程内存里，需要重置）、逐套运行，
最后用 `tests/e2e/cleanup.sql` 清理本次产生的临时账号与内容。
可用 `DC_API_BASE` 指向别的环境，例如 `DC_API_BASE=https://<隧道域名>/api bash tests/run-e2e-tests.sh`。

## App 与公网地址分发

这个项目已经包含 Capacitor Android 壳，前端会在运行时优先从 Gitee 读取公网地址配置，然后再决定 API 基地址。

- Gitee 运行时配置分支：`runtime-config`
- Gitee 运行时配置文件：`deploy/runtime-config.json`
- App 默认读取的配置地址：
  - `https://gitee.com/zh_anghanlin/daily-canvas/raw/runtime-config/deploy/runtime-config.json`
  - `https://gitee.com/api/v5/repos/zh_anghanlin/daily-canvas/contents/deploy/runtime-config.json?ref=runtime-config`

当远程配置可用时，App 会优先使用其中的 `apiBaseUrl`；如果 Gitee 临时不可用，会回退到上次缓存的地址。

## 外网穿透与地址自愈

项目内置了 Cloudflare Quick Tunnel 的 Docker 服务，以及一个巡检脚本：

```bash
python3 ops/tunnel_guard.py
```

脚本会做这些事：

1. 确保本地 Docker 栈已经启动
2. 检查当前公网隧道是否可用
3. 如果地址失效，自动重建新的公网地址
4. 验证新地址是否真的可访问
5. 把最新地址写入 Gitee 的 `runtime-config` 分支

如果当前地址不可用，脚本会持续重试，默认最多运行 50 分钟：

```bash
python3 ops/tunnel_guard.py --max-runtime-minutes 50
```

### 常驻看门狗（推荐）

Cloudflare 临时通道一旦断开，旧地址会永久失效，手机 App 会直接报「网络错误」。
所以本机安装了一个常驻看门狗，默认每 10 分钟自检一次，断了就自动重建并重新发布地址。

安装文件位置：

- 守护配置：`~/Library/LaunchAgents/com.dailycanvas.tunnel-watchdog.plist`
- 运行脚本：`~/Library/Application Support/daily-canvas/tunnel-watchdog.sh`
- 运行日志：`~/Library/Logs/daily-canvas/tunnel-watchdog.log`

注意：`~/Desktop` 属于 macOS 受保护目录，launchd 后台任务读不到，所以看门狗用的是
「独立版」脚本（不读取项目目录，只依赖 docker / git / python3）。
仓库里的 `ops/launchd/tunnel-watchdog-standalone.sh` 是它的源文件，改动后需要重新复制到上面那个路径。

常用命令：

```bash
# 查看状态
launchctl print "gui/$(id -u)/com.dailycanvas.tunnel-watchdog" | head -20

# 查看日志
tail -n 50 ~/Library/Logs/daily-canvas/tunnel-watchdog.log

# 立即触发一次自检
launchctl kickstart -k "gui/$(id -u)/com.dailycanvas.tunnel-watchdog"

# 停止 / 恢复守护
launchctl bootout "gui/$(id -u)/com.dailycanvas.tunnel-watchdog"
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.dailycanvas.tunnel-watchdog.plist
```

## WebView 壳 App 接入

这套方案更适合做成一个轻量的 WebView 壳 App，而不是继续做原生 Android 改造。

壳 App 只需要做两件事：

1. 从 Gitee 读取运行时配置文件
2. 用 WebView 打开配置里的 `publicBaseUrl`

运行时配置地址：

- `https://gitee.com/zh_anghanlin/daily-canvas/raw/runtime-config/deploy/runtime-config.json`

配置内容示例：

```json
{
  "publicBaseUrl": "https://example.trycloudflare.com",
  "apiBaseUrl": "https://example.trycloudflare.com/api",
  "healthUrl": "https://example.trycloudflare.com/api/health",
  "source": "cloudflare-quick-tunnel",
  "updatedAt": "2026-07-24T00:00:00Z"
}
```

推荐的壳子加载逻辑：

1. 启动时拉取 Gitee 上的 `runtime-config.json`
2. 读取其中的 `publicBaseUrl`
3. WebView 直接打开这个地址
4. 如果拉取失败，回退到上次缓存的 `publicBaseUrl`

这样壳 App 不需要内置固定接口地址，也不需要跟随隧道地址变化重新发版。

## App 版本更新（应用内更新）

App 内已经内置「关于 Daily Canvas」页面，可以查看当前版本、更新说明，并在发现新版本时直接下载覆盖安装，不需要再手动把安装包传到手机。

入口：`个人中心 → 关于 Daily Canvas`，或首页底部的「关于 Daily Canvas」。

更新过程：

1. App 读取版本清单 `app-release.json`（优先 `publicBaseUrl/downloads/app-release.json`，其次 Gitee `runtime-config` 分支）
2. 比较清单里的 `versionCode` 与本机安装包版本
3. 有更新时点击「立即更新」，原生插件下载 APK 并校验 SHA-256
4. 下载完成后自动调起系统安装器覆盖安装；Android 8.0+ 首次会跳转「安装未知应用」授权页，授权后返回会自动继续

### 一次性准备：固定签名

覆盖安装要求新旧版本的签名一致，否则系统会拒绝安装（`INSTALL_FAILED_UPDATE_INCOMPATIBLE`）。因此需要先固定一份签名密钥：

```bash
ops/gen-android-keystore.sh
```

脚本会生成 `frontend/android/daily-canvas-release.jks`、本地配置 `frontend/android/keystore.properties`，以及供 CI 使用的 Base64 文件。
未用 `--store-pass` 指定口令时，脚本会随机生成一个并打印出来，请立刻存进密码管理器——口令丢失同样会导致无法再打包更新。然后在 GitHub 仓库 `Settings → Secrets and variables → Actions` 中添加：

| Secret | 说明 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | 密钥库的 Base64 内容 |
| `ANDROID_KEYSTORE_PASSWORD` | 密钥库密码 |
| `ANDROID_KEY_ALIAS` | 密钥别名，默认 `daily-canvas` |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |
| `ANDROID_KEYSTORE_TYPE` | 可选，`JKS`（默认）或 `PKCS12`（用 openssl 生成时填） |

密钥丢失后无法继续覆盖更新已安装的 App，请务必备份。首次从「历史上用临时 debug 签名打包的版本」切换到固定签名时，需要卸载重装一次，之后即可一直覆盖更新。

### 发布流程

```bash
# 1. GitHub Actions「Build Android APK」手动运行，填写 version_name / version_code，下载签名 APK
#    或本地构建：cd frontend && npm run cap:sync && cd android && ./gradlew assembleRelease -PappVersionName=1.1 -PappVersionCode=2

# 2. 发布到下载目录并生成版本清单
ops/publish-android-release.sh app-release.apk \
  --version 1.1 \
  --code 2 \
  --notes release-notes.md \
  --push-manifest
```

脚本会把安装包放进 `deploy/downloads/`、写入 `app-release.json`，`--push-manifest` 会同时把清单同步到 Gitee 的 `runtime-config` 分支。安装包目录已经挂载进前端容器，发布后手机打开「关于」页即可看到更新。

清单字段：

| 字段 | 说明 |
| --- | --- |
| `versionCode` | 版本号，必须递增，App 用它判断是否有更新 |
| `versionName` | 展示用版本名 |
| `releaseNotes` | 更新说明，字符串数组 |
| `apkPath` | 相对公网地址的安装包路径 |
| `apkUrl` | 可选，安装包的绝对地址（优先于 `apkPath`） |
| `sha256` | 安装包校验值，下载后校验，可不填 |
| `size` | 安装包大小（字节），用于展示 |
| `forceUpdate` | 是否强制更新 |

## 学习资源

- [TypeScript 文档](https://www.typescriptlang.org/docs/)
- [React 文档](https://react.dev/)
- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [SQLAlchemy 文档](https://docs.sqlalchemy.org/)
- [PostgreSQL 文档](https://www.postgresql.org/docs/)

## License

MIT
