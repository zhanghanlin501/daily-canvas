"""
认证工具模块
处理密码哈希和 JWT Token
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from ..config import settings
from ..database import get_db
from ..models import User, RefreshToken, StaffUser
from ..schemas import TokenData

# 密码哈希上下文
# 使用 pbkdf2_sha256 算法，避免 bcrypt 的 72 字节限制
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# Bearer Token 安全方案
security = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码
    :param plain_password: 明文密码
    :param hashed_password: 哈希后的密码
    :return: 是否匹配
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    对密码进行哈希
    :param password: 明文密码
    :return: 哈希后的密码
    """
    # bcrypt 限制密码长度为 72 字节，超过会抛出错误
    # 这里进行截断处理
    if len(password) > 72:
        password = password[:72]
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    创建 JWT Access Token
    :param data: 要编码到 token 中的数据
    :param expires_delta: 过期时间增量
    :return: JWT token 字符串
    """
    to_encode = data.copy()
    to_encode["type"] = "access"
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm="HS256"
    )
    return encoded_jwt


def decode_token(token: str) -> Optional[TokenData]:
    """
    解码 JWT Token
    :param token: JWT token 字符串
    :return: TokenData 或 None
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=["HS256"]
        )
        if payload.get("type") != "access":
            return None

        user_id = payload.get("sub")
        if user_id is None:
            return None

        try:
            return TokenData(user_id=int(user_id))
        except (TypeError, ValueError):
            return None
    except JWTError:
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    获取当前登录用户
    通过 Authorization header 中的 Bearer Token 验证用户身份
    :param credentials: HTTP Bearer 凭证
    :param db: 数据库会话
    :return: 用户模型
    :raises HTTPException: Token 无效或用户不存在
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise credentials_exception

    token = credentials.credentials
    token_data = decode_token(token)

    if token_data is None or token_data.user_id is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == token_data.user_id).first()

    if user is None:
        raise credentials_exception

    return user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    可选登录态：携带有效 access token 时返回用户，否则返回 None。

    用于公开接口按查看者身份应用拉黑过滤，但不强制登录。
    """
    if credentials is None:
        return None

    token_data = decode_token(credentials.credentials)
    if token_data is None or token_data.user_id is None:
        return None

    return db.query(User).filter(User.id == token_data.user_id).first()


def hash_refresh_token(token: str) -> str:
    """刷新令牌只存哈希，避免数据库泄露后可直接使用。"""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_refresh_token(db: Session, user_id: int) -> str:
    """为指定用户创建长效刷新令牌，并返回明文给客户端一次。"""
    raw_token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )

    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=expires_at,
        )
    )
    db.flush()
    return raw_token


def get_active_refresh_token(
    db: Session,
    raw_token: str,
) -> Optional[RefreshToken]:
    """查询未撤销且未过期的刷新令牌记录。"""
    token_hash = hash_refresh_token(raw_token)
    record = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        )
        .with_for_update()
        .first()
    )

    if record is None:
        return None

    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at <= datetime.now(timezone.utc):
        return None

    return record


def revoke_refresh_token(db: Session, raw_token: str) -> bool:
    """撤销指定刷新令牌；已经不存在时返回 False。"""
    record = get_active_refresh_token(db, raw_token)
    if record is None:
        return False

    record.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return True


# ==================== 管理端（staff）认证 ====================

STAFF_TOKEN_EXPIRE_MINUTES = 12 * 60


def create_staff_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """管理端令牌，type=staff_access，与普通用户 token 互不通用。"""
    to_encode = data.copy()
    to_encode["type"] = "staff_access"
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])

    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=STAFF_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


def decode_staff_token(token: str) -> Optional[int]:
    """解析管理端令牌，返回 staff id；普通用户 token 一律返回 None。"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        return None

    if payload.get("type") != "staff_access":
        return None

    staff_id = payload.get("sub")
    if staff_id is None:
        return None

    try:
        return int(staff_id)
    except (TypeError, ValueError):
        return None


async def get_optional_staff(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[StaffUser]:
    """可选管理端身份：用于作者与管理员都能查看的状态历史接口。"""
    if credentials is None:
        return None

    staff_id = decode_staff_token(credentials.credentials)
    if staff_id is None:
        return None

    return db.query(StaffUser).filter(StaffUser.id == staff_id).first()


async def get_current_staff(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> StaffUser:
    """校验管理端令牌，返回管理端账号。"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="需要管理端权限",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise credentials_exception

    staff_id = decode_staff_token(credentials.credentials)
    if staff_id is None:
        raise credentials_exception

    staff = db.query(StaffUser).filter(StaffUser.id == staff_id).first()
    if staff is None:
        raise credentials_exception

    return staff


def ensure_staff_bootstrap(db: Session) -> None:
    """
    按环境变量创建/更新最小管理端账号。

    未配置 STAFF_USERNAME / STAFF_PASSWORD 时不创建任何账号，
    避免出现可猜测的默认后台口令。
    """
    username = (settings.STAFF_USERNAME or "").strip()
    password = settings.STAFF_PASSWORD or ""

    if not username or not password:
        return

    staff = db.query(StaffUser).filter(StaffUser.username == username).first()
    if staff is None:
        staff = StaffUser(
            username=username,
            password_hash=get_password_hash(password),
            role="moderator",
        )
        db.add(staff)
        db.commit()
        return

    # 允许通过环境变量轮换口令
    if not verify_password(password, staff.password_hash):
        staff.password_hash = get_password_hash(password)
        db.commit()
