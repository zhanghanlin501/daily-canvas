"""
数据模型模块
定义数据库表结构的 ORM 模型
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint, Index
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

    # 情绪标签（可选）
    mood = Column(String(20), nullable=True)

    # 创建时间
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # 更新时间
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 关系 - 关联到用户
    user = relationship("User", back_populates="posts")

    # 索引 - 确保每个用户每天只能发布一条创作
    __table_args__ = (
        Index("idx_user_created", "user_id", "created_at"),
    )