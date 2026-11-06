"""
数据模型模块
定义数据库表结构的 ORM 模型
"""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    """
    用户模型
    对应 users 表
    """

    # 表名
    __tablename__ = "users"

    # 主键 - 自增整数
    id = Column(Integer, primary_key=True, index=True)

    # 用户名 - 最大50字符，唯一，不允许为空
    username = Column(String(50), unique=True, nullable=False, index=True)

    # 邮箱 - 最大100字符，唯一，不允许为空
    email = Column(String(100), unique=True, nullable=False, index=True)

    # 密码哈希 - 不允许为空，存储加密后的密码
    password_hash = Column(String(255), nullable=False)

    # 创建时间 - 默认当前时间
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 更新时间 - 自动更新为当前时间
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 关系 - 一个用户可以有多个创作
    posts = relationship("DailyPost", back_populates="user", cascade="all, delete-orphan")


class Mood(Base):
    """
    情绪标签模型
    对应 moods 表
    存储可用的情绪选项
    """

    __tablename__ = "moods"

    # 主键
    id = Column(Integer, primary_key=True, index=True)

    # 情绪名称
    name = Column(String(20), nullable=False)

    # 情绪表情（emoji）
    emoji = Column(String(10), nullable=False)

    # 情绪颜色（HEX 值）
    color = Column(String(7), nullable=False)


class DailyPost(Base):
    """
    每日创作模型
    对应 daily_posts 表
    存储用户每天的创作内容
    """

    __tablename__ = "daily_posts"

    # 主键
    id = Column(Integer, primary_key=True, index=True)

    # 用户 ID - 外键关联 users 表
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # 创作内容
    content = Column(Text, nullable=False)

    # 业务日期：按 APP_TIMEZONE 计算，用于严格限制每个用户每天一条
    post_date = Column(Date, nullable=False)

    # 情绪标签（可选）
    mood = Column(String(20), nullable=True)

    # 作者意图：public（公开）/ private（仅自己可见）。
    # 与 status 完全正交：平台隐藏不会覆盖作者原本的可见性设置。
    visibility = Column(
        String(10), nullable=False, server_default="public", default="public", index=True
    )

    # 平台裁定：normal / pending / hidden / deleted。
    status = Column(
        String(10), nullable=False, server_default="normal", default="normal", index=True
    )

    # 内容最近一次编辑时间（用于 24 小时编辑窗口；调整可见性不写这个字段）
    edited_at = Column(DateTime(timezone=True), nullable=True)

    # 作者软删除时间（回收站 30 天恢复窗口以此为准；恢复后清空）
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # 是否由作者本人删除。管理端强制删除的内容不会进入作者回收站，也不能由作者恢复。
    deleted_by_author = Column(
        Boolean, nullable=False, server_default="false", default=False
    )

    # 创建时间
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # 更新时间
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 关系 - 关联到用户
    user = relationship("User", back_populates="posts")

    # 索引 - 确保每个用户每天只能发布一条创作
    __table_args__ = (
        UniqueConstraint("user_id", "post_date", name="uq_daily_posts_user_post_date"),
        Index("idx_user_created", "user_id", "created_at"),
        Index("idx_posts_public_feed", "status", "visibility", "post_date"),
    )


class PostStatusHistory(Base):
    """创作状态变化留痕，可追溯每条内容何时、被谁、因为什么改变了状态。"""

    __tablename__ = "post_status_history"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(
        Integer,
        ForeignKey("daily_posts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # 新建时 from_status 为空
    from_status = Column(String(10), nullable=True)
    to_status = Column(String(10), nullable=False)
    reason = Column(String(255), nullable=True)
    # user / staff / system
    actor_type = Column(String(10), nullable=False, default="system")
    actor_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    post = relationship("DailyPost")


class ModerationAction(Base):
    """人工处置留痕：谁在什么时候对哪条内容做了什么。"""

    __tablename__ = "moderation_actions"

    id = Column(Integer, primary_key=True, index=True)
    target_type = Column(String(20), nullable=False, default="post")
    target_id = Column(Integer, nullable=False, index=True)
    action = Column(String(30), nullable=False)
    operator_id = Column(Integer, nullable=True)
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Report(Base):
    """用户举报记录。同一用户对同一对象只能举报一次。"""

    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    target_type = Column(String(20), nullable=False, default="post")
    target_id = Column(Integer, nullable=False, index=True)
    reporter_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # 举报理由分类：色情低俗 / 暴力血腥 / 辱骂攻击 / 广告引流 / 违法违规 / 侵犯版权 / 其他
    reason = Column(String(30), nullable=False)
    detail = Column(String(200), nullable=True)
    # pending / reviewing / resolved / rejected
    status = Column(String(20), nullable=False, default="pending", index=True)
    ticket_no = Column(String(40), nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    reporter = relationship("User")

    __table_args__ = (
        UniqueConstraint(
            "reporter_id", "target_type", "target_id",
            name="uq_reports_reporter_target",
        ),
    )


class Block(Base):
    """拉黑关系：单向记录，双向隔离。"""

    __tablename__ = "blocks"

    id = Column(Integer, primary_key=True, index=True)
    blocker_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    blocked_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uq_blocks_blocker_blocked"),
    )


class StaffUser(Base):
    """最小管理端账号，与普通用户表隔离。"""

    __tablename__ = "staff_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="moderator")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RefreshToken(Base):
    """长效刷新令牌，只存哈希值，支持轮换与主动注销。"""

    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User")
