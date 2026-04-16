"""
创作路由
处理创作相关的 API 请求
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..schemas import PostCreate, PostResponse, PaginatedResponse
from ..crud import (
    get_posts,
    get_user_posts,
    get_post_by_id,
    create_post,
    check_user_posted_today,
    get_random_post,
    get_mood_by_name,
)
from ..auth import get_current_user
from ..models import User, DailyPost

# 创建路由实例
router = APIRouter(prefix="/posts", tags=["创作"])


@router.get("", response_model=PaginatedResponse[PostResponse])
async def get_timeline(
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db)
):
    """
    获取时间线（所有用户的创作）

    公开接口，无需登录
    """
    posts, total = get_posts(db, page=page, limit=limit)

    # 计算总页数
    total_pages = (total + limit - 1) // limit

    # 获取情绪信息
    enriched_posts = []
    for post in posts:
        post_dict = {
            "id": post.id,
            "user_id": post.user_id,
            "content": post.content,
            "mood": post.mood,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
            "user": post.user,
            "mood_info": get_mood_by_name(db, post.mood) if post.mood else None
        }
        enriched_posts.append(PostResponse(**post_dict))

    return PaginatedResponse(
        items=enriched_posts,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )


@router.get("/me", response_model=PaginatedResponse[PostResponse])
async def get_my_posts(
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    获取当前用户的创作列表

    需要登录
    """
    posts, total = get_user_posts(db, user_id=current_user.id, page=page, limit=limit)

    # 计算总页数
    total_pages = (total + limit - 1) // limit

    # 转换为响应格式
    enriched_posts = []
    for post in posts:
        post_dict = {
            "id": post.id,
            "user_id": post.user_id,
            "content": post.content,
            "mood": post.mood,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
            "user": post.user,
            "mood_info": get_mood_by_name(db, post.mood) if post.mood else None
        }
        enriched_posts.append(PostResponse(**post_dict))

    return PaginatedResponse(
        items=enriched_posts,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )


@router.post("", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_new_post(
    post_data: PostCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    发布今日创作

    每个用户每天只能发布一条
    需要登录
    """
    # 检查今天是否已发布
    if check_user_posted_today(db, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="今天已经发布过创作了，明天再来吧！"
        )

    # 验证情绪标签是否存在
    if post_data.mood:
        mood = get_mood_by_name(db, post_data.mood)
        if not mood:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无效的情绪标签"
            )

    # 创建创作
    post = create_post(db, current_user.id, post_data)

    # 获取完整的响应数据
    mood_info = get_mood_by_name(db, post.mood) if post.mood else None

    return PostResponse(
        id=post.id,
        user_id=post.user_id,
        content=post.content,
        mood=post.mood,
        created_at=post.created_at,
        updated_at=post.updated_at,
        user=current_user,
        mood_info=mood_info
    )


@router.get("/random", response_model=PostResponse)
async def get_random_explore(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    随机漫步 - 获取一条随机创作

    用于探索其他用户的创作
    需要登录
    """
    post = get_random_post(db)

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="暂时没有可以探索的创作"
        )

    mood_info = get_mood_by_name(db, post.mood) if post.mood else None

    return PostResponse(
        id=post.id,
        user_id=post.user_id,
        content=post.content,
        mood=post.mood,
        created_at=post.created_at,
        updated_at=post.updated_at,
        user=post.user,
        mood_info=mood_info
    )


@router.get("/{post_id}", response_model=PostResponse)
async def get_post_detail(
    post_id: int,
    db: Session = Depends(get_db)
):
    """
    获取单条创作详情

    公开接口
    """
    post = get_post_by_id(db, post_id)

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="创作不存在"
        )

    mood_info = get_mood_by_name(db, post.mood) if post.mood else None

    return PostResponse(
        id=post.id,
        user_id=post.user_id,
        content=post.content,
        mood=post.mood,
        created_at=post.created_at,
        updated_at=post.updated_at,
        user=post.user,
        mood_info=mood_info
    )