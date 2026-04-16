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
- [x] 发布每日创作
- [x] 浏览时间线
- [x] 随机漫步探索
- [x] 情绪标签
- [x] 个人中心

## 学习资源

- [TypeScript 文档](https://www.typescriptlang.org/docs/)
- [React 文档](https://react.dev/)
- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [SQLAlchemy 文档](https://docs.sqlalchemy.org/)
- [PostgreSQL 文档](https://www.postgresql.org/docs/)

## License

MIT