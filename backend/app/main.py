import logging
import time
import uuid

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import settings
from .database import engine, Base
from .db_migrations import ensure_schema
from .auth import ensure_staff_bootstrap
from .database import SessionLocal
from .routers import auth_router, posts_router, moods_router, safety_router, staff_router

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

# 结构化访问日志：慢请求和失败请求必须可追踪，且能通过 X-Request-ID 串起前后端排查
access_logger = logging.getLogger("daily_canvas.access")


@app.middleware("http")
async def log_request(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    started_at = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - started_at) * 1000
        access_logger.exception(
            "request_failed request_id=%s method=%s path=%s duration_ms=%.1f",
            request_id,
            request.method,
            request.url.path,
            duration_ms,
        )
        raise

    duration_ms = (time.perf_counter() - started_at) * 1000
    response.headers["X-Request-ID"] = request_id

    if response.status_code >= 400 or duration_ms >= 300:
        access_logger.info(
            "request request_id=%s method=%s path=%s status=%s duration_ms=%.1f",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )

    return response

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
app.include_router(safety_router, prefix=settings.API_PREFIX)
app.include_router(staff_router, prefix=settings.API_PREFIX)


@app.get("/", tags=["首页"])
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": f"{settings.API_PREFIX}/docs",
        "health": f"{settings.API_PREFIX}/health",
        "ready": f"{settings.API_PREFIX}/health/ready",
    }


@app.get(f"{settings.API_PREFIX}/health", tags=["健康检查"])
async def health_check():
    """存活检查：只证明进程还在，不查数据库，用于隧道/容器是否存活的判断。"""
    return {"status": "healthy"}


@app.get(f"{settings.API_PREFIX}/health/ready", tags=["健康检查"])
async def readiness_check():
    """就绪检查：区分「进程存活」与「数据库可用」，数据库不可用时返回 503。"""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - 就绪检查要把所有数据库异常都归类为未就绪
        access_logger.warning("readiness_failed database=down error=%s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "degraded", "database": "down"},
        )

    return {"status": "ready", "database": "up", "timezone": settings.APP_TIMEZONE}


@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)
    ensure_schema(engine)
    db = SessionLocal()
    try:
        ensure_staff_bootstrap(db)
    finally:
        db.close()
    print(f"{settings.APP_NAME} v{settings.APP_VERSION} 启动成功！")


@app.on_event("shutdown")
async def shutdown_event():
    print(f"{settings.APP_NAME} 正在关闭...")
