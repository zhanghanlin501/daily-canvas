# Daily Canvas - 项目规格说明书

## 1. 项目概述

### 1.1 项目简介
**Daily Canvas（每日画布）** 是一个极简的每日创作分享平台，用户每天可以在"画布"上分享一段文字、一句话、一个想法或小灵感。整体风格采用**留白美学**，强调内容本身。

### 1.2 学习目标
本项目旨在帮助学习者掌握以下技术：

| 技术栈 | 学习内容 | 温故点 |
|--------|----------|--------|
| **TypeScript** | 类型系统、接口、泛型、类型守卫 | 强类型语言的优势 |
| **React** | 组件化、Hooks、Context | 前端框架核心概念 |
| **Vite** | 构建工具、插件系统、热更新 | 现代前端工程化 |
| **FastAPI** | 异步框架、路由、中间件 | Python Web 开发 |
| **PostgreSQL** | 关系型数据库、SQL 查询 | 数据库设计与优化 |
| **SQLAlchemy** | ORM 映射、数据库操作 | Python 数据库操作 |
| **JWT** | Token 认证、安全机制 | 前后端身份验证 |

---

## 2. 技术架构

### 2.1 项目目录结构
```
daily-canvas/
├── docs/                     # 项目文档
│   ├── SPEC.md             # 本文档
│   ├── API.md              # API 接口文档
│   ├── DATABASE.md         # 数据库设计文档
│   └── DEPLOYMENT.md       # 部署文档
│
├── frontend/                # 前端项目 (Vite + React + TypeScript)
│   ├── src/
│   │   ├── api/            # API 调用层
│   │   ├── components/     # React 组件
│   │   ├── pages/          # 页面组件
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── types/          # TypeScript 类型定义
│   │   ├── context/         # React Context
│   │   ├── utils/          # 工具函数
│   │   └── styles/         # 全局样式
│   ├── public/             # 静态资源
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
└── backend/                  # 后端项目 (FastAPI + Python)
    ├── app/
    │   ├── __init__.py
    │   ├── main.py          # FastAPI 应用入口
    │   ├── config.py       # 配置文件
    │   ├── database.py     # 数据库连接
    │   ├── models/          # SQLAlchemy 模型
    │   ├── schemas/         # Pydantic 数据模型
    │   ├── routers/         # API 路由
    │   ├── crud/            # 数据库操作层
    │   ├── auth/            # 认证相关
    │   └── utils/           # 工具函数
    ├── requirements.txt
    └── Dockerfile
```

### 2.2 技术选型理由

#### 前端
- **Vite**: 下一代前端构建工具，开发体验极佳，热更新速度快
- **React 18**: 组件化开发，生态丰富
- **TypeScript**: 类型安全，提高代码质量和可维护性
- **TailwindCSS**: 原子化 CSS，快速构建简约界面
- **React Query**: 服务端状态管理，缓存和同步
- **React Hook Form**: 高性能表单处理

#### 后端
- **FastAPI**: 现代异步 Python Web 框架，性能高，自动生成 API 文档
- **SQLAlchemy**: Python 最流行的 ORM，功能强大
- **Pydantic**: 数据验证和设置管理
- **Python-JOSE**: JWT Token 生成和验证
- **PassLib**: 密码哈希加密

#### 数据库
- **PostgreSQL**: 功能强大的开源关系型数据库，支持复杂查询

---

## 3. 数据库设计

### 3.1 ER 图
```
┌─────────────────┐       ┌─────────────────┐
│     users       │       │   daily_posts   │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │──┐    │ id (PK)         │
│ username        │  │    │ user_id (FK)    │──┐
│ email           │  └────│ created_at      │  │
│ password_hash   │       │ content         │  │
│ created_at      │       │ mood            │  │
└─────────────────┘       └─────────────────┘  │
                                              │
                   ┌─────────────────┐         │
                   │     moods       │         │
                   ├─────────────────┤         │
                   │ id (PK)         │◄────────┘
                   │ name            │
                   │ emoji           │
                   └─────────────────┘
```

### 3.2 表结构详解

#### users 用户表
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,              -- 自增主键
    username VARCHAR(50) UNIQUE NOT NULL, -- 用户名，唯一
    email VARCHAR(100) UNIQUE NOT NULL,   -- 邮箱，唯一
    password_hash VARCHAR(255) NOT NULL,  -- 密码哈希
    created_at TIMESTAMP DEFAULT NOW(),   -- 创建时间
    updated_at TIMESTAMP DEFAULT NOW()    -- 更新时间
);
```

#### daily_posts 每日创作表
```sql
CREATE TABLE daily_posts (
    id SERIAL PRIMARY KEY,              -- 自增主键
    user_id INTEGER REFERENCES users(id), -- 外键，关联用户
    content TEXT NOT NULL,               -- 创作内容
    mood VARCHAR(20),                    -- 情绪标签
    created_at TIMESTAMP DEFAULT NOW(),  -- 创建时间（精确到天）
    updated_at TIMESTAMP DEFAULT NOW()    -- 更新时间
);

-- 确保每个用户每天只能发布一条创作
CREATE UNIQUE INDEX unique_user_daily
ON daily_posts(user_id, DATE(created_at));
```

#### moods 情绪表
```sql
CREATE TABLE moods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(20) NOT NULL,          -- 情绪名称
    emoji VARCHAR(10) NOT NULL,          -- 情绪表情
    color VARCHAR(7) NOT NULL           -- 情绪颜色（HEX）
);
```

---

## 4. API 接口设计

### 4.1 认证相关接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/logout` | 用户登出 |
| GET | `/api/auth/me` | 获取当前用户信息 |

### 4.2 创作相关接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/posts` | 获取时间线（所有用户的创作） |
| GET | `/api/posts/me` | 获取我的创作 |
| POST | `/api/posts` | 发布今日创作 |
| GET | `/api/posts/random` | 随机漫步（随机获取一条创作） |
| GET | `/api/posts/{id}` | 获取单条创作详情 |

### 4.3 情绪相关接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/moods` | 获取所有情绪选项 |

---

## 5. 前端页面设计

### 5.1 页面结构

```
/                    # 首页（时间线）
├── /login           # 登录页
├── /register       # 注册页
├── /compose        # 发布创作页
├── /explore        # 随机漫步页
└── /profile        # 个人中心
```

### 5.2 设计风格

**设计理念：留白即美**
- 大量留白，让内容成为焦点
- 单一色调（黑白灰为主）
- 精致的字体和排版
- 移动优先的响应式设计

**色彩方案**：
- 主色：#1a1a1a（深灰黑）
- 背景色：#ffffff（纯白）
- 辅助背景：#f5f5f5（浅灰）
- 文字色：#333333（中灰）
- 次要文字：#999999（浅灰）
- 强调色：根据情绪标签变化

---

## 6. 实施计划

### 第一阶段：项目初始化
- [x] 创建项目目录结构
- [ ] 初始化前端项目
- [ ] 初始化后端项目
- [ ] 配置数据库

### 第二阶段：核心功能
- [ ] 用户注册/登录
- [ ] JWT 认证
- [ ] 每日创作发布
- [ ] 时间线展示

### 第三阶段：增强功能
- [ ] 情绪标签系统
- [ ] 随机漫步
- [ ] 用户资料页

### 第四阶段：完善与部署
- [ ] 代码优化
- [ ] 添加注释
- [ ] 编写文档
- [ ] Docker 部署

---

## 7. 学习资源

### TypeScript
- 官方文档：https://www.typescriptlang.org/docs/
- 中文文档：https://www.tslang.cn/

### React
- 官方文档：https://react.dev/
- Hooks 指南：https://react.dev/reference/react

### FastAPI
- 官方文档：https://fastapi.tiangolo.com/
- 中文文档：https://fastapi.tiangolo.com/zh/

### PostgreSQL
- 官方文档：https://www.postgresql.org/docs/
- SQL 教程：https://www.postgresqltutorial.com/

---

## 8. 版本记录

| 版本 | 日期 | 描述 |
|------|------|------|
| 1.0.0 | 2026-04-14 | 初始版本 |
