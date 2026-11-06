"""
认证路由
处理用户注册、登录、登出等功能
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone

from ..database import get_db
from ..schemas import (
    UserCreate,
    UserResponse,
    Token,
    RefreshTokenRequest,
    AuthResponse,
)
from ..crud import create_user, authenticate_user, get_user_by_email, get_user_by_username
from ..auth import (
    create_access_token,
    create_refresh_token,
    get_active_refresh_token,
    get_current_user,
    revoke_refresh_token,
)
from ..models import User
from ..config import settings
from ..rate_limit import (
    LOGIN_ACCOUNT_LIMITER,
    LOGIN_IP_LIMITER,
    REGISTER_IP_LIMITER,
    client_ip,
    enforce,
    too_many_requests,
)

# 创建路由实例
router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, request: Request, db: Session = Depends(get_db)):
    """
    用户注册

    - **username**: 用户名（3-50个字符）
    - **email**: 邮箱地址
    - **password**: 密码（至少6个字符）
    """
    # 注册入口按来源 IP 限流，阻断脚本化批量刷号。
    # 隧道下所有外部流量共用一个容器 IP，因此阈值放得比较宽松。
    register_ip_key = f"register:{client_ip(request)}"
    enforce(REGISTER_IP_LIMITER, register_ip_key, "注册尝试过于频繁，请稍后再试")
    retry_after = REGISTER_IP_LIMITER.record_attempt(register_ip_key)
    if retry_after > 0:
        raise too_many_requests(retry_after, "注册尝试过于频繁，请稍后再试")

    # 检查邮箱是否已存在
    if get_user_by_email(db, user_data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册"
        )

    # 检查用户名是否已存在
    if get_user_by_username(db, user_data.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该用户名已被使用"
        )

    # 创建用户
    user = create_user(db, user_data)
    return user


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    用户登录

    使用 OAuth2 密码模式
    - **username**: 邮箱地址
    - **password**: 密码
    """
    # 暴力破解防护：先按账号（邮箱）判定，再用来源 IP 兜底
    login_account_key = f"login:{(form_data.username or '').strip().lower()}"
    login_ip_key = f"login-ip:{client_ip(request)}"
    enforce(LOGIN_ACCOUNT_LIMITER, login_account_key, "该账号密码错误次数过多，请稍后再试")
    enforce(LOGIN_IP_LIMITER, login_ip_key, "登录尝试过于频繁，请稍后再试")

    # 验证用户
    user = authenticate_user(db, form_data.username, form_data.password)

    if not user:
        retry_after = max(
            LOGIN_ACCOUNT_LIMITER.record_attempt(login_account_key),
            LOGIN_IP_LIMITER.record_attempt(login_ip_key),
        )
        if retry_after > 0:
            raise too_many_requests(retry_after, "密码错误次数过多，请稍后再试")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 登录成功后清空该账号的失败记录，正常用户不会被自己之前的输错连带锁定
    LOGIN_ACCOUNT_LIMITER.clear(login_account_key)

    # 创建短效访问令牌与长效刷新令牌
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.id},
        expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(db, user.id)
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "refresh_expires_in": settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    }


@router.post("/refresh", response_model=Token)
async def refresh_token(
    refresh_data: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    """用长效刷新令牌换取新的短效访问令牌，并轮换刷新令牌。"""
    stored_token = get_active_refresh_token(db, refresh_data.refresh_token)

    if stored_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="刷新令牌无效或已过期，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )

    stored_token.revoked_at = datetime.now(timezone.utc)
    new_access_token = create_access_token(
        data={"sub": stored_token.user_id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    new_refresh_token = create_refresh_token(db, stored_token.user_id)
    db.commit()

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "refresh_expires_in": settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    refresh_data: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    """注销当前刷新令牌；接口保持幂等。"""
    revoke_refresh_token(db, refresh_data.refresh_token)
    return None


@router.get("/me", response_model=AuthResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """
    获取当前登录用户信息

    需要携带有效的 JWT Token
    """
    return {"user": current_user}
