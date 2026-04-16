"""
CRUD 操作层
提供数据库的增删改查操作
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional, List, Tuple
from datetime import datetime, date

from ..models import User, Mood, DailyPost
from ..schemas import UserCreate, PostCreate
from ..auth import get_password_hash, verify_password


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
    limit: int = 20
) -> Tuple[List[DailyPost], int]:
    """
    获取时间线（所有用户的创作）
    :param db: 数据库会话
    :param page: 页码
    :param limit: 每页数量
    :return: (创作列表, 总数)
    """
    # 查询总数
    total = db.query(func.count(DailyPost.id)).scalar()

    # 查询列表
    offset = (page - 1) * limit
    posts = (
        db.query(DailyPost)
        .order_by(desc(DailyPost.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return posts, total


def get_user_posts(
    db: Session,
    user_id: int,
    page: int = 1,
    limit: int = 20
) -> Tuple[List[DailyPost], int]:
    """
    获取指定用户的创作列表
    :param db: 数据库会话
    :param user_id: 用户 ID
    :param page: 页码
    :param limit: 每页数量
    :return: (创作列表, 总数)
    """
    # 查询总数
    total = db.query(func.count(DailyPost.id)).filter(
        DailyPost.user_id == user_id
    ).scalar()

    # 查询列表
    offset = (page - 1) * limit
    posts = (
        db.query(DailyPost)
        .filter(DailyPost.user_id == user_id)
        .order_by(desc(DailyPost.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return posts, total


def get_post_by_id(db: Session, post_id: int) -> Optional[DailyPost]:
    """根据 ID 获取创作"""
    return db.query(DailyPost).filter(DailyPost.id == post_id).first()


def create_post(db: Session, user_id: int, post_data: PostCreate) -> DailyPost:
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
        mood=post_data.mood
    )
    db.add(db_post)
    db.commit()
    db.refresh(db_post)
    return db_post


def check_user_posted_today(db: Session, user_id: int) -> bool:
    """
    检查用户今天是否已经发布过创作
    :param db: 数据库会话
    :param user_id: 用户 ID
    :return: 是否已发布
    """
    today = date.today()
    post = (
        db.query(DailyPost)
        .filter(
            DailyPost.user_id == user_id,
            func.date(DailyPost.created_at) == today
        )
        .first()
    )
    return post is not None


def get_random_post(db: Session) -> Optional[DailyPost]:
    """
    获取一条随机创作
    用于"随机漫步"功能
    :param db: 数据库会话
    :return: 随机创作或 None
    """
    return (
        db.query(DailyPost)
        .order_by(func.random())
        .first()
    )