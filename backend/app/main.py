"""
Daily Canvas 后端主应用
极简每日创作分享平台的 API 服务
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import engine, Base
from .routers import auth_router, posts_router, moods_router

# 创建 FastAPI 应用实例
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
    Daily Canvas - 极简每日创作分享平台

    一个让用户每天分享一条创作灵感的简约平台。

    ## 功能

    * 用户注册和登录（JWT 认证）
    * 每日创作发布（每天限一条）
    * 时间线浏览
    * 随机漫步探索
    * 情绪标签

    ## 技术栈

    * **后端**: FastAPI + Python
    * **数据库**: PostgreSQL + SQLAlchemy
    * **认证**: JWT Token
    """,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ==================== CORS 中间件配置 ====================
# 允许前端跨域访问

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in settings.CORS_ORIGINS.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 路由注册 ====================

# 注册认证路由（/api/auth/*）
app.include_router(auth_router, prefix=settings.API_PREFIX)

# 注册创作路由（/api/posts/*）
app.include_router(posts_router, prefix=settings.API_PREFIX)

# 注册情绪路由（/api/moods/*）
app.include_router(moods_router, prefix=settings.API_PREFIX)


# ==================== 根路由 ====================

@app.get("/", tags=["首页"])
async def root():
    """
    根路由，返回服务信息
    """
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }


@app.get("/health", tags=["健康检查"])
async def health_check():
    """
    健康检查路由
    用于监控服务状态
    """
    return {"status": "healthy"}


# ==================== 启动事件 ====================

@app.on_event("startup")
async def startup_event():
    """
    应用启动时执行
    """
    # 创建数据库表（如果不存在）
    # 注意：生产环境应使用数据库迁移工具（如 Alembic）
    Base.metadata.create_all(bind=engine)
    print(f"{settings.APP_NAME} v{settings.APP_VERSION} 启动成功！")


@app.on_event("shutdown")
async def shutdown_event():
    """
    应用关闭时执行
    """
    print(f"{settings.APP_NAME} 正在关闭...")
