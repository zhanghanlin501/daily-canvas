from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import engine, Base
from .routers import auth_router, posts_router, moods_router

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
    docs_url=f"{settings.API_PREFIX}/docs",
    redoc_url=f"{settings.API_PREFIX}/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix=settings.API_PREFIX)
app.include_router(posts_router, prefix=settings.API_PREFIX)
app.include_router(moods_router, prefix=settings.API_PREFIX)


@app.get("/", tags=["首页"])
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": f"{settings.API_PREFIX}/docs",
        "health": f"{settings.API_PREFIX}/health",
    }


@app.get(f"{settings.API_PREFIX}/health", tags=["健康检查"])
async def health_check():
    return {"status": "healthy"}


@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)
    print(f"{settings.APP_NAME} v{settings.APP_VERSION} 启动成功！")


@app.on_event("shutdown")
async def shutdown_event():
    print(f"{settings.APP_NAME} 正在关闭...")
