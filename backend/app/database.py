"""
数据库配置文件
配置 SQLAlchemy 数据库连接和会话管理
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
from .config import settings

# 创建数据库引擎
# check_same_thread=False 用于支持 FastAPI 的异步特性
engine = create_engine(
    settings.DATABASE_URL,
    # 连接池配置
    pool_pre_ping=True,  # 连接前测试连接是否有效
    pool_size=10,  # 保持的连接数
    max_overflow=20,  # 允许超过 pool_size 的连接数
)

# 创建会话工厂
# sessionmaker 创建的工厂用于生成数据库会话
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建声明性基类
# 所有 ORM 模型需要继承这个基类
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    获取数据库会话的依赖函数

    FastAPI 的依赖注入系统会使用这个函数
    为每个请求创建独立的数据库会话
    用法：
        @app.get("/items")
        def get_items(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
