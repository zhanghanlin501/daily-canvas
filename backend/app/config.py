import json
import os
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


DEFAULT_INSECURE_SECRET_KEYS = {
    "your-secret-key-change-in-production",
    "changeme",
    "secret",
    "daily-canvas",
}


class Settings(BaseSettings):
    APP_NAME: str = "Daily Canvas"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    APP_ENV: str = "development"
    APP_TIMEZONE: str = "Asia/Shanghai"

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/daily_canvas"
    )

    # 必须由环境变量或 .env 注入；不存在默认值，避免生产环境误用可预测密钥。
    SECRET_KEY: str = Field(..., min_length=32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # 登录暴力破解防护（进程内滑窗，见 app/rate_limit.py）
    # 隧道下所有外部流量共用同一个容器 IP，所以「按账号」是主要防线，「按 IP」只是宽松兜底。
    LOGIN_MAX_FAILURES_PER_ACCOUNT: int = 8
    # 隧道下所有外部流量共用同一个容器 IP，按 IP 计数实际是「全局」计数，
    # 所以阈值放得很高、锁定时长很短，只用于阻断脚本化喷号，避免误伤全体用户。
    LOGIN_MAX_FAILURES_PER_IP: int = 200
    LOGIN_WINDOW_SECONDS: int = 900
    LOGIN_LOCKOUT_SECONDS: int = 900
    LOGIN_IP_LOCKOUT_SECONDS: int = 300
    STAFF_LOGIN_MAX_FAILURES_PER_ACCOUNT: int = 5
    STAFF_LOGIN_LOCKOUT_SECONDS: int = 1800
    # 隧道下这是「全局」计数，阈值必须留足余量，只用于阻断脚本化批量注册
    REGISTER_MAX_ATTEMPTS_PER_IP: int = 60
    REGISTER_WINDOW_SECONDS: int = 3600
    REGISTER_LOCKOUT_SECONDS: int = 600

    # 管理端最小账号：仅在两个变量都配置时才在启动时创建/更新
    STAFF_USERNAME: str = ""
    STAFF_PASSWORD: str = ""

    CORS_ORIGINS: str = (
        "http://localhost:3000,"
        "http://localhost:5173,"
        "http://localhost:8080,"
        "http://localhost,"
        "https://localhost"
    )

    class Config:
        env_file = ".env"
        case_sensitive = True

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        normalized = value.strip()

        if normalized in DEFAULT_INSECURE_SECRET_KEYS:
            raise ValueError(
                "SECRET_KEY 不能使用默认值。请用 `openssl rand -hex 32` 生成后通过环境变量注入。"
            )

        if len(normalized) < 32:
            raise ValueError("SECRET_KEY 至少需要 32 个字符。")

        return normalized

    @property
    def cors_origins_list(self) -> list[str]:
        raw_value = self.CORS_ORIGINS.strip()
        if not raw_value:
            return []

        if raw_value.startswith("["):
            try:
                parsed = json.loads(raw_value)
            except json.JSONDecodeError:
                parsed = []
            return [origin.strip() for origin in parsed if isinstance(origin, str) and origin.strip()]

        return [origin.strip() for origin in raw_value.split(",") if origin.strip()]


settings = Settings()
