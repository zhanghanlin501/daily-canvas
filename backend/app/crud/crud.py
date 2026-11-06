"""
CRUD 操作层
提供数据库的增删改查操作
"""

from sqlalchemy.orm import Session
from sqlalchemy import desc
import random
from typing import Optional, List, Tuple
from datetime import datetime, date

from ..models import User, Mood, DailyPost
from ..schemas import UserCreate, PostCreate
from ..auth import get_password_hash, verify_password
from ..time_utils import today_in_app_timezone
from ..content_safety import (
    STATUS_DELETED,
    VISIBILITY_PUBLIC,
    public_posts_query,
)


# ==================== 用户 CRUD ====================

def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    """根据 ID 获取用户"""
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """根据邮箱获取用户"""
    return db.query(User).filter(User.email == email).first()


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    """根据用户名获取用户"""
    return db.query(User).filter(User.username == username).first()


def create_user(db: Session, user_data: UserCreate) -> User:
    """
    创建新用户
    :param db: 数据库会话
    :param user_data: 用户创建数据
    :return: 创建的用户对象
    """
    # 创建用户对象
    db_user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=get_password_hash(user_data.password)
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """
    验证用户登录
    :param db: 数据库会话
    :param email: 邮箱
    :param password: 密码
    :return: 用户对象或 None
    """
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


# ==================== 情绪 CRUD ====================

def get_moods(db: Session) -> List[Mood]:
    """获取所有情绪标签"""
    return db.query(Mood).all()


def get_mood_by_name(db: Session, name: str) -> Optional[Mood]:
    """根据名称获取情绪"""
    return db.query(Mood).filter(Mood.name == name).first()


# ==================== 创作 CRUD ====================

def get_posts(
    db: Session,
    page: int = 1,
    limit: int = 20,
    viewer_id: Optional[int] = None,
) -> Tuple[List[DailyPost], int]:
    """
    获取公开时间线。

    统一走 content_safety.public_posts_query：只返回 normal + public，
    并排除与查看者存在拉黑关系的内容；私密内容不计入公开总数。
    :param db: 数据库会话
    :param page: 页码
    :param limit: 每页数量
    :param viewer_id: 当前查看者（可为空，匿名浏览时无法应用拉黑过滤）
    :return: (创作列表, 总数)
    """
    query = public_posts_query(db, viewer_id)
    total = query.count()

    offset = (page - 1) * limit
    posts = (
        query
        .order_by(desc(DailyPost.post_date), desc(DailyPost.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return posts, total


def get_user_posts(
    db: Session,
    user_id: int,
    page: int = 1,
    limit: int = 20,
    viewer_id: Optional[int] = None,
    include_deleted: bool = False,
) -> Tuple[List[DailyPost], int]:
    """
    获取指定用户的创作列表
    :param db: 数据库会话
    :param user_id: 用户 ID
    :param page: 页码
    :param limit: 每页数量
    :param viewer_id: 当前查看者；只有本人能看到私密与待审内容
    :param include_deleted: 本人回收站场景才允许包含已删除内容
    :return: (创作列表, 总数)
    """
    if viewer_id == user_id:
        query = db.query(DailyPost).filter(DailyPost.user_id == user_id)
        if not include_deleted:
            query = query.filter(DailyPost.status != STATUS_DELETED)
    else:
        query = public_posts_query(db, viewer_id).filter(DailyPost.user_id == user_id)

    total = query.count()

    offset = (page - 1) * limit
    posts = (
        query
        .order_by(desc(DailyPost.post_date), desc(DailyPost.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return posts, total


def get_post_by_id(db: Session, post_id: int) -> Optional[DailyPost]:
    """根据 ID 获取创作"""
    return db.query(DailyPost).filter(DailyPost.id == post_id).first()


def create_post(
    db: Session,
    user_id: int,
    post_data: PostCreate,
    post_date: Optional[date] = None,
    visibility: str = VISIBILITY_PUBLIC,
) -> DailyPost:
    """
    创建新创作
    :param db: 数据库会话
    :param user_id: 用户 ID
    :param post_data: 创作数据
    :return: 创建的创作对象
    """
    db_post = DailyPost(
        user_id=user_id,
        content=post_data.content,
        mood=post_data.mood,
        post_date=post_date or today_in_app_timezone(),
        visibility=visibility,
    )
    db.add(db_post)
    db.commit()
    db.refresh(db_post)
    return db_post


def check_user_posted_today(
    db: Session,
    user_id: int,
    target_date: Optional[date] = None,
) -> bool:
    """
    检查用户今天是否已经发布过创作
    :param db: 数据库会话
    :param user_id: 用户 ID
    :return: 是否已发布
    """
    business_date = target_date or today_in_app_timezone()
    post = (
        db.query(DailyPost)
        .filter(
            DailyPost.user_id == user_id,
            DailyPost.post_date == business_date,
        )
        .first()
    )
    return post is not None


def get_random_post(
    db: Session,
    viewer_id: Optional[int] = None,
    exclude_id: Optional[int] = None,
) -> Optional[DailyPost]:
    """
    获取一条随机创作
    用于"随机漫步"功能
    :param db: 数据库会话
    :param viewer_id: 查看者，用于拉黑过滤
    :param exclude_id: 排除上一次抽到的创作，避免紧邻重复
    :return: 随机创作或 None
    """
    query = public_posts_query(db, viewer_id)
    if exclude_id is not None:
        query = query.filter(DailyPost.id != exclude_id)

    # 不使用 ORDER BY random()（会全表扫描并排序），
    # 改为「先数总数，再随机取一个偏移量」，结果分布相同但没有排序开销
    total = query.count()
    if total == 0:
        return None

    offset = random.randrange(total)
    return query.order_by(DailyPost.id).offset(offset).limit(1).first()
