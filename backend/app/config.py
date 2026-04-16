"""
配置文件
管理应用的配置参数，支持从环境变量读取
"""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    应用配置类
    使用 Pydantic 的 BaseSettings 从环境变量加载配置
    """

    # 应用名称
    APP_NAME: str = "Daily Canvas"
    # 应用版本
    APP_VERSION: str = "1.0.0"
    # API 前缀
    API_PREFIX: str = "/api"

    # 数据库配置
    # 使用 PostgreSQL 数据库
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/daily_canvas"
    )

    # JWT 配置
    # Secret Key 用于签名 JWT Token
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    # Token 过期时间（分钟）
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天

    # CORS 配置
    # 允许的源（前端地址）
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    class Config:
        # 从 .env 文件加载环境变量
        env_file = ".env"
        case_sensitive = True


# 创建全局配置实例
settings = Settings()
