"""
Pydantic 数据模型
用于 API 请求和响应的数据验证
"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Generic, TypeVar
from datetime import datetime

T = TypeVar("T")


# ==================== 用户相关 Schema ====================


class UserBase(BaseModel):
    """用户基础模型"""

    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: EmailStr = Field(..., description="邮箱地址")


class UserCreate(UserBase):
    """创建用户时的请求模型"""

    password: str = Field(..., min_length=6, description="密码")

    @field_validator("username")
    def validate_username(cls, v: str) -> str:
        """验证用户名格式"""
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("用户名只能包含字母、数字、下划线和连字符")
        return v


class UserResponse(UserBase):
    """用户响应模型"""

    id: int
    created_at: datetime

    class Config:
        from_attributes = True  # 支持从 ORM 模型创建


# ==================== 认证相关 Schema ====================


class LoginRequest(BaseModel):
    """登录请求模型"""

    email: EmailStr = Field(..., description="邮箱地址")
    password: str = Field(..., description="密码")


class Token(BaseModel):
    """Token 响应模型"""

    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Token 中包含的数据"""

    user_id: Optional[int] = None


class AuthResponse(BaseModel):
    """认证响应模型"""

    user: UserResponse


# ==================== 情绪相关 Schema ====================


class MoodResponse(BaseModel):
    """情绪响应模型"""

    id: int
    name: str
    emoji: str
    color: str

    class Config:
        from_attributes = True


# ==================== 创作相关 Schema ====================


class PostBase(BaseModel):
    """创作基础模型"""

    content: str = Field(..., min_length=1, max_length=500, description="创作内容")
    mood: Optional[str] = Field(None, description="情绪标签")


class PostCreate(PostBase):
    """创建创作时的请求模型"""

    pass


class PostResponse(PostBase):
    """创作响应模型"""

    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    user: Optional[UserResponse] = None
    mood_info: Optional[MoodResponse] = None

    class Config:
        from_attributes = True


# ==================== 分页相关 Schema ====================


class PaginatedResponse(BaseModel, Generic[T]):
    """分页响应模型"""

    items: List[T]
    total: int
    page: int
    limit: int
    total_pages: int
