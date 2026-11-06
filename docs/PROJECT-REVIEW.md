# Daily Canvas 项目梳理报告

## 0. 文档信息

| 项目 | 内容 |
| --- | --- |
| 梳理日期 | 2026-11-06 |
| 梳理范围 | 代码、数据、部署、运维、文档、工作区状态 |
| 当前分支 | `code-to-app`（7 次提交，工作区有大量未提交改动） |
| 当前线上版本 | App 1.0.2（versionCode 3）/ 后端 API 1.0.0 |
| 当前公网地址 | `https://montana-totally-planned-utilization.trycloudflare.com`（临时地址，会变） |
| 代码规模 | 后端 17 个文件 / 1152 行；前端 22 个文件 / 2741 行（不含依赖与构建产物） |

### 结论摘要

- **功能**：最小闭环已跑通（注册 → 发布 → 浏览 → 探索 → 个人中心），但缺互动、缺检索、缺内容安全，产品偏薄。
- **质量**：有 3 个正在线上发生的问题（隐私泄露、日期基准、缺唯一约束），工程底座缺迁移与测试。
- **运维**：隧道 + 看门狗 + 应用内更新这条链路已经跑通，今天 13:37 看门狗自动救回过一次，验证有效。
- **文档**：`docs/SPEC.md` 已明显过期且与实际代码不符，`docs/PRD-NEXT.md` 是新的需求文档，两者需要划清关系。
- **工作区**：本轮新增的图标、关于页、更新能力、运维脚本全部未提交，需要归拢提交。

---

## 1. 项目全景

| 维度 | 现状 |
| --- | --- |
| 定位 | 极简每日创作分享平台，每天一条，留白美学 |
| 形态 | Web 站点 + Android WebView 壳（Capacitor）+ 本地 Docker 栈 + Cloudflare 临时隧道对外 |
| 前端 | Vite 4 + React 18 + TypeScript 5 + Tailwind 3 + React Query 5 + react-router 6 + axios |
| 后端 | FastAPI 0.104 + SQLAlchemy 2.0 + Pydantic 2 + python-jose + passlib（pbkdf2_sha256） |
| 数据库 | PostgreSQL 13（容器），3 条用户数据、3 条创作数据、8 个预置心情标签 |
| Android | Capacitor 8，`com.dailycanvas.app`，compileSdk 36，已固定签名（PKCS12） |
| 对外暴露 | `tunnel` 容器（cloudflared 快速隧道）→ 前端容器 nginx |

---

## 2. 目录职责地图

| 目录 / 文件 | 职责 | 状态 |
| --- | --- | --- |
| `backend/app/` | FastAPI 应用：路由（auth/posts/moods）、模型、CRUD、鉴权、配置 | 正常 |
| `backend/init_db.py` | 建表 + 预置 8 个心情标签 | 正常，但依赖 `create_all`，无迁移机制 |
| `backend/requirements.txt` | Python 依赖（已固定版本） | 正常 |
| `frontend/src/` | React 应用：7 个页面、2 个 API 模块 + 请求封装、3 个配置模块、2 个 Hook、1 个原生桥接 | 正常 |
| `frontend/android/` | Capacitor Android 壳、签名配置、图标与启动页资源 | 正常 |
| `frontend/public/` | 站点图标（SVG + 192/512 + apple-touch-icon） | 正常 |
| `frontend/nginx.conf` | 静态托管 + `/api/` 反向代理 + `/downloads/` 安装包目录 | 正常 |
| `ops/` | 签名生成、版本发布、隧道守护、看门狗 | 正常 |
| `ops/launchd/` | 看门狗的 macOS 常驻配置与独立版脚本 | 正常，已安装并运行 |
| `tools/render-app-icons.cjs` | 图标与启动页生成脚本 | 一次性工具，依赖未纳入 package.json |
| `deploy/` | 版本清单与安装包下载目录 | 正常 |
| `docs/` | `SPEC.md`（过期）+ `PRD-NEXT.md`（新） | 需要整理 |
| `.github/workflows/android-apk.yml` | CI 构建 APK | 可用，有 4 处隐患（见第 6 节） |

---

## 3. 运行时链路

```
手机 App（Capacitor WebView）
  │ ① 启动时读 Gitee runtime-config，取 publicBaseUrl
  │ ② 用 WebView 打开该地址
  ▼
Cloudflare 临时隧道（trycloudflare.com，地址会变）
  ▼
frontend 容器（nginx:80，宿主 8080）
  ├── /            → React 静态资源（SPA fallback）
  ├── /api/        → 反向代理到 backend:8000
  └── /downloads/  → 挂载 ./deploy/downloads（APK + app-release.json）
  ▼
backend 容器（uvicorn，FastAPI，8000）
  ▼
db 容器（postgres:13-alpine，数据卷 postgres_data，宿主 5432）
```

两条旁路：

1. **地址自愈**：`launchd` 看门狗每 10 分钟自检隧道；不可用就重建隧道、验证新地址、同步到 Gitee 的 `runtime-config` 分支。App 每次启动都会重读，所以地址变了手机也能跟上。
2. **版本更新**：App「关于」页读 `/downloads/app-release.json`（或 Gitee 兜底），比对 `versionCode`，原生插件下载 APK、校验 SHA-256、调起系统安装器覆盖安装。

---

## 4. 功能盘点

### 4.1 已实现且可用

| 模块 | 能力 | 位置 |
| --- | --- | --- |
| 账号 | 注册、登录、JWT（7 天）、登出（前端清 token） | `backend/app/routers/auth.py` |
| 创作 | 发布纯文本（≤500 字）+ 可选心情标签，每人每天一条 | `ComposePage.tsx` |
| 时间线 | 全站创作按时间倒序，仅第 1 页 20 条 | `HomePage.tsx` |
| 探索 | 随机漫步，随机返回一条 | `ExplorePage.tsx` |
| 个人中心 | 首字母头像、用户名、邮箱、创作数、加入日期、我的创作（上限 50） | `ProfilePage.tsx` |
| 心情标签 | 8 个预置标签（emoji + 颜色） | `moods` 表 |
| 关于 App | 图标、版本、检查更新、下载安装、更新说明、包名、运行环境、仓库链接 | `AboutPage.tsx` |
| 应用内更新 | 版本清单比对 + 原生下载 + SHA-256 校验 + 覆盖安装 | `useAppUpdate.ts`、`AppUpdaterPlugin.java` |
| 品牌资产 | 全新应用图标、启动页、favicon（墨黑 + 米白笔锋） | `frontend/public`、`res/mipmap-*` |

### 4.2 有但存在明显短板

| 模块 | 短板 |
| --- | --- |
| 时间线 | 只能看前 20 条，无翻页、无筛选、无搜索 |
| 随机漫步 | 可能连续抽到同一条；查询用 `ORDER BY random()`，数据一多就慢 |
| 个人中心 | 只有计数，没有成长数据；头像不能上传；无分页 |
| 关于页 | 只有版本与技术信息，缺产品介绍、历史版本、服务状态、反馈、协议 |
| 登录态 | Token 7 天到期即登出，无续期、无找回密码 |
| 创作管理 | 发布后不能编辑、不能删除、无草稿 |

### 4.3 完全缺失

互动（点赞/评论/收藏/通知）、搜索与标签筛选、作者主页、私密创作、创作状态与审核、举报与拉黑、内容管理后台、密码找回、限流、日志与错误上报、自动化测试。

---

## 5. 工程质量与技术债

### 5.1 P0：线上正在发生的问题

| 编号 | 问题 | 证据 | 后果 |
| --- | --- | --- | --- |
| Q1 | 公开接口泄露作者邮箱 | 实测 `GET /api/posts` 返回的 `user` 含 `email` | 任何人无需登录即可批量抓取全站用户邮箱 |
| Q2 | 「每天一条」按 UTC 判定 | `docker compose exec backend date` 为 UTC；`check_user_posted_today` 用 `date.today()` | 北京时间 00:00–08:00 无法发布新一天的内容 |
| Q3 | 数据库无唯一约束 | `models.py` 只有普通索引 | 并发或重试可能写入同一天两条 |
| Q4 | 无数据库迁移 | 用 `Base.metadata.create_all` 建表 | 后续加字段只能手工改库，线上数据无法安全演进 |
| Q5 | 零自动化测试 | 全仓库无测试目录与测试用例 | 任何改动都只能靠手工点，回归成本高 |

### 5.2 P1：影响体验与可维护性

| 编号 | 问题 | 说明 |
| --- | --- | --- |
| Q6 | 时间线无翻页 | 接口支持分页，前端只请求第 1 页 |
| Q7 | 随机漫步全表排序 | `ORDER BY random()`，数据量大时明显变慢 |
| Q8 | 401 无差别跳登录 | 公开页面带着过期 token 也会被踢到登录页 |
| Q9 | Token 不可续期 | 7 天到期必须重新输密码 |
| Q10 | 无日志与监控 | 后端仅 `print`，无结构化日志、无错误上报 |
| Q11 | 无接口限流 | 注册、登录、发布均无限流 |
| Q12 | CORS 偏窄 | 默认仅 localhost 域名，生产靠同源代理规避 |

### 5.3 P2：整洁度

| 项 | 说明 | 建议 |
| --- | --- | --- |
| `backend/app/utils/` | 空目录，只有 `__init__.py` | 删除或补实现 |
| `backend/daily_canvas.db` | 49KB SQLite 文件，本地调试遗留 | 删除（已被 gitignore 忽略） |
| `deploy/.DS_Store` | macOS 元数据 | 删除，已被 gitignore 忽略 |
| `drawable-land-xxxhdpi/`、`drawable-port-xxxhdpi/` | 目录还在但 splash.png 已被删除 | 补齐或删空目录 |
| `tools/render-app-icons.cjs` | 依赖 `/tmp/svgrender/node_modules/` 里的 sharp | 把 sharp 写进 devDependencies，否则换机器跑不起来 |
| `frontend/android/app/build/`（23MB） | 构建产物 | 已由 android/.gitignore 忽略，无需处理 |

---

## 6. 部署与发布链路

### 6.1 当前链路

| 环节 | 实现 |
| --- | --- |
| 本地运行 | `docker compose up -d`（db / backend / frontend / tunnel） |
| 前端构建 | 多阶段 Dockerfile：`node:18-alpine` 构建 → `nginx:1.27-alpine` 托管 |
| 后端启动 | `python init_db.py && uvicorn app.main:app` |
| 公网暴露 | cloudflared 快速隧道（`--protocol http2 --url http://frontend:80`） |
| 地址自愈 | `ops/tunnel_guard.py` + `launchd` 看门狗（每 10 分钟） |
| APK 构建 | 本地 Gradle 8.14.3 + JDK 21 + SDK 36；或 GitHub Actions |
| APK 发布 | `ops/publish-android-release.sh` 写入 `deploy/downloads/` 与 `app-release.json` |
| App 更新 | 关于页读清单 → 原生下载 → SHA-256 校验 → 系统安装器 |

已验证的事实：今天 13:37 隧道曾失效，看门狗在 24 秒内重建并同步到 Gitee，13:47 复检正常。

### 6.2 发现的隐患

| 编号 | 隐患 | 影响 | 建议 |
| --- | --- | --- | --- |
| D1 | CI 在 `push` 到 `main/master/code-to-app` 且 `frontend/**` 变更时**自动构建**，默认 `version_name=1.0`、`version_code=1` | 可能产出比线上更低的版本号，误发会「退版」 | 自动触发时改用手动触发，或从 `app-release.json` 自动读取递增版本 |
| D2 | CI 未配置签名时**构建 debug 包** | debug 签名每次不同，无法覆盖已装正式包 | 无签名密钥时直接失败并提示，不产出不可安装的包 |
| D3 | 签名类型默认不一致：`keystore.properties.example` 写 JKS，本地实际是 PKCS12（`.p12`） | CI 若没设 `ANDROID_KEYSTORE_TYPE=PKCS12` 会签名失败 | 统一为 PKCS12，并同步更新示例文件与 README |
| D4 | Node 版本不一致：Dockerfile 用 18，CI 用 22，本地 22 | 构建结果可能有差异 | 统一到 22，并在 `package.json` 加 `engines` |
| D5 | CI 强校验 `VITE_API_BASE_URL` | 但 App 现在改为运行时从 `runtime-config` 取地址，该要求已过时 | 移除必填校验，保留为可选覆盖 |
| D6 | 公网依赖 Cloudflare 临时地址 | 地址会变，靠看门狗兜底 | 中期换成固定域名 + 命名隧道 |

---

## 7. 文档现状

| 文档 | 状态 | 问题 |
| --- | --- | --- |
| `README.md` | 基本可用 | 「功能特性」清单缺「关于 App / 应用内更新 / 新图标」；发布流程写的是 `.jks`，实际本地是 `.p12` |
| `docs/SPEC.md` | **已过期** | 与代码多处不符，详见下表 |
| `docs/PRD-NEXT.md` | 新增，可用 | v1.3，包含状态机、私密创作、举报拉黑、关于页重构 |
| `docs/PROJECT-REVIEW.md` | 本文件 | — |
| `docs/API.md` / `DATABASE.md` / `DEPLOYMENT.md` | **不存在** | 但 `SPEC.md` 的项目结构里引用了它们 |

### SPEC.md 与代码不符的具体位置

| SPEC 中的描述 | 实际情况 |
| --- | --- |
| 存在 `POST /api/auth/logout` | 后端没有该接口，登出只是前端清 token |
| 登录接口按 JSON 传 `email` / `password` | 实际是 OAuth2 表单格式，字段名是 `username`（值为邮箱） |
| ER 图中 `mood` 关联到 `moods` 表 | `daily_posts.mood` 只是字符串，无外键 |
| 「已建唯一索引 `unique_user_daily ON (user_id, DATE(created_at))`」 | 代码里没有该约束 |
| 页面结构只有 5 个路由 | 实际有 7 个（含 `/about`） |
| 引用 `docs/API.md` 等 4 个文档 | 均不存在 |

> 勘误：本报告初版曾把 `GET /api/auth/me` 也列为「后端不存在」，这是错的。
> 该接口存在（`backend/app/routers/auth.py:85`），并且已实测可用（携带有效 token 返回 200）。
> 已在 2026-11-06 修正。

---

## 8. 工作区状态

分支 `code-to-app`，最近 7 次提交均为 CI / Android 配置相关。工作区存在大量未提交改动，且**混有两类内容**，提交前必须分开：

### 8.1 本轮（图标 + 关于页 + 更新 + 运维）新增

```
deploy/                                    版本清单与安装包目录
docs/PRD-NEXT.md                           需求文档
frontend/src/pages/AboutPage.tsx           关于页
frontend/src/hooks/useAppUpdate.ts         更新流程
frontend/src/native/                       原生桥接
frontend/src/config/                       appMeta / appRelease / runtimeConfig
frontend/android/.../AppUpdaterPlugin.java 原生下载安装插件
frontend/android/keystore.properties.example
ops/                                       签名、发布、隧道守护、看门狗
tools/render-app-icons.cjs                 图标生成
```

### 8.2 同时被修改的文件（需确认归属）

```
.github/workflows/android-apk.yml   frontend/Dockerfile        docker-compose.yml
README.md                           frontend/nginx.conf        frontend/index.html
.gitignore                          frontend/src/App.tsx       frontend/src/api/request.ts
frontend/src/pages/HomePage.tsx     frontend/src/pages/ProfilePage.tsx
frontend/android/app/build.gradle   frontend/android/app/src/main/AndroidManifest.xml
frontend/android/app/src/main/java/com/dailycanvas/app/MainActivity.java
frontend/android/app/src/main/res/**（图标、启动页、ic_launcher_background、file_paths）
frontend/public/**（app-icon.svg、icons/*）
```

其中 `frontend/Dockerfile`、`frontend/src/api/request.ts`、`HomePage.tsx`、`ProfilePage.tsx`、`App.tsx` 很可能是**用户此前自己的改动**，提交时需要单独甄别，不要一并裹进「本轮功能」的提交里。

### 8.3 已删除文件

```
frontend/android/app/src/main/res/drawable-land-xxxhdpi/splash.png
frontend/android/app/src/main/res/drawable-port-xxxhdpi/splash.png
```

两个目录目前是空的。若不打算补资源，建议一并删掉空目录，避免 Android 构建时产生歧义。

---

## 9. 风险清单

| 等级 | 风险 | 应对 |
| --- | --- | --- |
| 高 | 用户邮箱对外可批量抓取 | 立即拆分公开用户模型，去掉 email（PRD FR-0.1） |
| 高 | 不健康内容目前无任何处置手段 | 举报 + 拉黑 + 创作状态机（PRD FR-17 / FR-21 / FR-23） |
| 高 | 无数据库迁移能力，加字段要手工改线上库 | 引入 Alembic，先做基线迁移 |
| 中 | 临时隧道地址漂移影响可用性 | 已有看门狗兜底；中期换固定域名 |
| 中 | 无测试，重构风险高 | 先补关键接口契约测试（最少覆盖隐私、权限、日期边界） |
| 中 | 签名密钥丢失即无法继续覆盖更新 | 已生成 `.p12` 与 base64；务必离线备份 |
| 中 | CI 可能产出低版本号或 debug 包并误发 | 修正 workflow（见 D1、D2） |
| 低 | 工作区改动混杂，误提交用户原有改动 | 提交前按 8.1 / 8.2 分类甄别 |

> 特别提醒：本地已生成 `frontend/android/daily-canvas-release.p12` 与对应的 base64 文件，本地打包一直用的是它。
> 但 **CI 侧是否已配置那 5 个 Secrets 无法从本地核实**（本机没有 `gh` 命令）。
> 如果 Secrets 没配，CI 只会产出 debug 包，签名与正式包不同，无法覆盖安装 —— 这一项请在 GitHub 仓库的
> `Settings → Secrets and variables → Actions` 里自行核对一次。

---

## 10. 建议的整理动作

按优先级排列，每项都是可执行的动作。

### 第一组：立刻处理（线上问题）

1. 修 `GET /api/posts` 与 `/api/posts/{id}` 的用户模型，去掉 `email`
2. 把「每天一条」的日期基准改成 `Asia/Shanghai`
3. 加 `UNIQUE(user_id, post_date)` 约束（配合上一条）

### 第二组：把本轮成果归拢提交

4. 按 8.1 与 8.2 拆分提交：本轮功能一个提交，用户原有改动单独确认
5. 删掉空目录 `backend/app/utils/`、`drawable-land-xxxhdpi/`、`drawable-port-xxxhdpi/`
6. 清理 `backend/daily_canvas.db`、`deploy/.DS_Store`
7. 把 `sharp` 写进 `devDependencies`，让图标脚本可复现

### 第三组：工程底座

8. 引入 Alembic 并补基线迁移
9. 补最小测试集：隐私（无 email 泄露）、权限（越权 403/404）、日期边界（三时点）、并发（仅一条）
10. 修正 CI：去掉自动触发的默认版本、无签名时直接失败、签名类型统一 PKCS12、Node 统一 22、移除 `VITE_API_BASE_URL` 必填
11. 把 5 个签名相关 Secret 加到 GitHub 仓库
12. 统一 Node 版本（Dockerfile 18 → 22），`package.json` 补 `engines`

### 第四组：文档

13. `SPEC.md` 二选一：重写为「架构说明」，或直接标注为历史文档并指向 PRD
14. 补 `docs/CHANGELOG.md`，把 1.0.1 / 1.0.2 的更新内容归档
15. README「功能特性」补上关于页与应用内更新；发布流程的 `.jks` 改为 `.p12`
16. 按 PRD 第 11 节推进 V1.1 第一批（缺陷修复 + 创作状态机 + 举报拉黑 + 关于页重构）

---

## 11. 需求文档（PRD-NEXT.md）表格复查结果

按上次约定，把 PRD 里的表格逐张检查了一遍，重点看「一格塞多个主体」导致横向错位的问题：

| 表格 | 结果 |
| --- | --- |
| 文档信息、总体目标、需求总览、里程碑 | 正常，一格一值 |
| 2.1 已有能力清单、2.2 问题诊断 | 正常 |
| 8.2 数据模型、9.x 接口清单 | 正常 |
| FR-23 状态机「两条正交的轴」 | **已修正**（原先把三个主体塞进一格，导致误读为 `normal → 作者删除`） |
| FR-23 流转表 | **已拆成两张**（visibility 一张、status 一张），不再混轴 |
| 7.1 / 7.2 关于页区块 | 正常 |
| 13.2 已确认决策 | 正常 |

另外发现一处**规则本身的逻辑问题**（不是表格错位），已在 2026-11-06 确认并修正：

> 原 PRD 把「改内容」和「改可见性」都限制在发布后 24 小时内，意味着三天前写的内容今天想改成「仅自己可见」是不允许的。
> 实际上这是两件独立的事，已确认分开处理：
>
> - **改内容**：仍是发布后 24 小时窗口，超时不可改（保留「写下的东西不能随便反悔」的约束）
> - **改可见性**：**随时可改**，不受时间限制，作者任何时候都能把一条内容收回成「仅自己可见」，或重新公开
>
> PRD 已同步修改：FR-2（规则与验收）、FR-20、FR-23（取值归属表、流转表、新增硬性规则第 9 条）、
> 接口清单（`PATCH /api/posts/{id}/visibility` 改为无时间限制），并新增决策 D9。

---

## 12. 待确认问题

| 编号 | 问题 | 当前默认 | 影响 |
| --- | --- | --- | --- |
| O1 | 「锁定 24 小时」之后是否允许随时改成「仅自己可见」？ | **已确认：允许**（内容编辑限 24 小时，可见性随时可改） | 已写入 PRD，决策 D9 |
| O2 | 同一条内容被几个不同用户举报就自动进入待审？ | 5 人 | 门槛低易误伤，门槛高扩散快 |
| O3 | 是否需要「尝鲜版更新通道」？ | 不做 | 涉及灰度与清单管理成本 |
| O4 | 评论是否也要有状态？（评论在 V1.2 上线） | 未定 | 现在定可避免以后补丁式加字段 |
| O5 | 是否把临时隧道换成固定域名？ | 暂不换 | 换域名可彻底消除地址漂移 |
| O6 | `docs/SPEC.md` 是重写还是标记废弃？ | 待定 | 影响文档维护方式 |

---

## 附录：一句话总结

这个项目的**功能主线是清楚的**（每天一条 + 留白美学），**工程链路已经打通**（本地 Docker、公网隧道自愈、应用内更新都验证过），
当前的主要缺口集中在三处：**内容安全没有抓手**、**用户之间没有互动**、**工程底座缺迁移与测试**。
建议先把线上那三个问题修掉，再把本轮成果提交，然后按 PRD 的 V1.1 第一批推进。


