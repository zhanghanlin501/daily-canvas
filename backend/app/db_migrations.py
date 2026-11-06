"""
轻量数据库兼容迁移。

项目尚未引入 Alembic；这里只处理启动时必须成立的结构约束，并保证重复执行安全。
迁移会先检查历史数据是否违反“每人每天一条”，有冲突时拒绝启动而不是静默删数据。
"""

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from .time_utils import to_app_date


logger = logging.getLogger(__name__)

POST_DATE_COLUMN = "post_date"
POST_DATE_UNIQUE_INDEX = "uq_daily_posts_user_post_date"

# 内容安全第一批新增列：只加列并给默认值，不改动既有数据语义
CONTENT_SAFETY_COLUMNS: dict[str, str] = {
    "visibility": "VARCHAR(10) NOT NULL DEFAULT 'public'",
    "status": "VARCHAR(10) NOT NULL DEFAULT 'normal'",
    "edited_at": "TIMESTAMP WITH TIME ZONE",
}

CONTENT_SAFETY_INDEXES: dict[str, str] = {
    "ix_daily_posts_visibility": "CREATE INDEX IF NOT EXISTS ix_daily_posts_visibility ON daily_posts (visibility)",
    "ix_daily_posts_status": "CREATE INDEX IF NOT EXISTS ix_daily_posts_status ON daily_posts (status)",
    "idx_posts_public_feed": (
        "CREATE INDEX IF NOT EXISTS idx_posts_public_feed "
        "ON daily_posts (status, visibility, post_date)"
    ),
}

# 作者生命周期相关列：软删除时间（回收站 30 天恢复窗口）
LIFECYCLE_COLUMNS: dict[str, str] = {
    "deleted_at": "TIMESTAMP WITH TIME ZONE",
    "deleted_by_author": "BOOLEAN NOT NULL DEFAULT FALSE",
}


def _parse_created_at(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value

    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)

    raise RuntimeError(f"无法解析 daily_posts.created_at：{value!r}")


def _find_duplicate_dates(rows: list[dict[str, Any]]) -> list[str]:
    seen: dict[tuple[int, Any], int] = {}
    duplicates: list[tuple[int, Any, int]] = []

    for row in rows:
        post_date = row.get("post_date")
        if post_date is None:
            post_date = to_app_date(_parse_created_at(row["created_at"]))

        key = (int(row["user_id"]), post_date)
        first_post_id = seen.get(key)
        if first_post_id is None:
            seen[key] = int(row["id"])
        else:
            duplicates.append((key[0], key[1], first_post_id))

    if not duplicates:
        return []

    return [f"user_id={user_id}, post_date={post_date}, 首条 id={post_id}" for user_id, post_date, post_id in duplicates]


def ensure_content_safety_schema(engine: Engine) -> None:
    """
    为已有数据库补齐内容安全相关字段（visibility / status / edited_at）。

    新表（reports、blocks、post_status_history、moderation_actions、staff_users）
    由 Base.metadata.create_all 自动创建，这里只处理既有表加列，保证重复执行安全。
    """
    inspector = inspect(engine)
    if "daily_posts" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("daily_posts")}
    missing = [(name, ddl) for name, ddl in CONTENT_SAFETY_COLUMNS.items() if name not in columns]

    with engine.begin() as connection:
        for name, ddl in missing:
            connection.execute(text(f"ALTER TABLE daily_posts ADD COLUMN {name} {ddl}"))
            logger.info("已为 daily_posts 添加 %s 字段", name)

        for index_name, ddl in CONTENT_SAFETY_INDEXES.items():
            connection.execute(text(ddl))

    if missing:
        logger.info("daily_posts 内容安全字段已就绪：%s", ", ".join(name for name, _ in missing))


def ensure_post_date_schema(engine: Engine) -> None:
    """为已有数据库补齐 post_date 字段和每日唯一约束。"""
    inspector = inspect(engine)
    if "daily_posts" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("daily_posts")}
    select_columns = ["id", "user_id", "created_at"]
    if POST_DATE_COLUMN in columns:
        select_columns.append(POST_DATE_COLUMN)

    with engine.begin() as connection:
        rows = [
            dict(row)
            for row in connection.execute(
                text(f"SELECT {', '.join(select_columns)} FROM daily_posts")
            ).mappings()
        ]

        duplicates = _find_duplicate_dates(rows)
        if duplicates:
            details = "\n".join(f"- {item}" for item in duplicates)
            raise RuntimeError(
                "数据库中存在同一用户同一天的重复创作，无法建立唯一约束。\n"
                "请先确认保留哪一条并清理重复数据后再启动：\n"
                f"{details}"
            )

        if POST_DATE_COLUMN not in columns:
            connection.execute(
                text("ALTER TABLE daily_posts ADD COLUMN post_date DATE")
            )
            logger.info("已为 daily_posts 添加 post_date 字段")

        for row in rows:
            if row.get(POST_DATE_COLUMN) is not None:
                continue

            post_date = to_app_date(_parse_created_at(row["created_at"]))
            connection.execute(
                text("UPDATE daily_posts SET post_date = :post_date WHERE id = :post_id"),
                {"post_date": post_date, "post_id": row["id"]},
            )

        if engine.dialect.name == "postgresql":
            connection.execute(
                text("ALTER TABLE daily_posts ALTER COLUMN post_date SET NOT NULL")
            )

        connection.execute(
            text(
                f"CREATE UNIQUE INDEX IF NOT EXISTS {POST_DATE_UNIQUE_INDEX} "
                "ON daily_posts (user_id, post_date)"
            )
        )

    logger.info("daily_posts 的 post_date 与每日唯一约束已就绪")


def ensure_schema(engine: Engine) -> None:
    """启动时统一执行的轻量迁移入口，保证幂等。"""
    ensure_post_date_schema(engine)
    ensure_content_safety_schema(engine)
    ensure_lifecycle_schema(engine)


def ensure_lifecycle_schema(engine: Engine) -> None:
    """补齐作者生命周期字段（软删除时间），只加列不改动既有数据。"""
    inspector = inspect(engine)
    if "daily_posts" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("daily_posts")}
    missing = [(name, ddl) for name, ddl in LIFECYCLE_COLUMNS.items() if name not in column_names]

    if not missing:
        return

    with engine.begin() as connection:
        for name, ddl in missing:
            connection.execute(text(f"ALTER TABLE daily_posts ADD COLUMN {name} {ddl}"))
            logger.info("已为 daily_posts 添加 %s 字段", name)
