"""
应用时区工具。

数据库统一存 UTC，业务上的“某一天”统一按 APP_TIMEZONE 计算，
避免北京时间 00:00-08:00 的内容被算到前一天。
"""

from datetime import date, datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .config import settings


def _resolve_app_timezone() -> tzinfo:
    try:
        return ZoneInfo(settings.APP_TIMEZONE)
    except ZoneInfoNotFoundError:
        # 兼容缺少 tzdata 的极简容器；中国时区没有夏令时，固定 UTC+8 等价。
        if settings.APP_TIMEZONE in {"Asia/Shanghai", "UTC+8", "Etc/GMT-8"}:
            return timezone(timedelta(hours=8))
        raise


APP_TIMEZONE = _resolve_app_timezone()


def now_in_app_timezone() -> datetime:
    """返回应用时区下的当前时间。"""
    return datetime.now(APP_TIMEZONE)


def today_in_app_timezone() -> date:
    """返回应用时区下的今天。"""
    return now_in_app_timezone().date()


def to_app_date(value: datetime) -> date:
    """
    将数据库时间转换为应用时区日期。

    PostgreSQL 驱动通常返回带时区的 datetime；为兼容 SQLite 等场景，
    对无时区时间按 UTC 解释。
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(APP_TIMEZONE).date()
