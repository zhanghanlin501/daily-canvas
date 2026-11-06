"""
Pydantic 数据模型
用于 API 请求和响应的数据验证
"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Generic, Literal, TypeVar
from datetime import date, datetime

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


class PublicUserResponse(BaseModel):
    """公开用户响应模型：不包含邮箱等私有字段。"""

    id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== 认证相关 Schema ====================


class LoginRequest(BaseModel):
    """登录请求模型"""

    email: EmailStr = Field(..., description="邮箱地址")
    password: str = Field(..., description="密码")


class Token(BaseModel):
    """Token 响应模型"""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int


class RefreshTokenRequest(BaseModel):
    """刷新或注销 token 的请求模型"""

    refresh_token: str = Field(..., min_length=20)


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

    visibility: Literal["public", "private"] = Field(
        "public", description="可见性：public 公开 / private 仅自己可见"
    )
    # 不传表示今天；传过去日期表示补写，窗口由路由层校验。
    post_date: Optional[date] = Field(None, description="创作归属日期，可补写最近 3 天")


class PostResponse(PostBase):
    """创作响应模型"""

    id: int
    user_id: int
    post_date: date
    created_at: datetime
    updated_at: Optional[datetime] = None
    edited_at: Optional[datetime] = None
    # 软删除时间：只有作者视角（回收站 / 详情）会用到
    deleted_at: Optional[datetime] = None
    # 是否由作者本人删除；管理端强制删除的内容不会进入作者回收站
    deleted_by_author: bool = False
    # 作者意图与平台裁定两条正交轴
    visibility: str = "public"
    status: str = "normal"
    user: Optional[PublicUserResponse] = None
    mood_info: Optional[MoodResponse] = None
    # 只有作者本人请求时才会带上这些额外信息
    display_status: Optional[str] = None
    can_edit_content: Optional[bool] = None

    class Config:
        from_attributes = True


class VisibilityUpdate(BaseModel):
    """调整可见性请求体：不受 24 小时编辑窗口限制。"""

    visibility: Literal["public", "private"] = Field(..., description="public 或 private")


class PostUpdate(BaseModel):
    """24 小时窗口内的内容编辑请求体。

    只允许改内容与情绪；可见性有独立接口，不受这个窗口限制。
    两个字段都不传时视为空请求，由路由层拒绝。
    """

    content: Optional[str] = Field(None, min_length=1, max_length=500, description="创作内容")
    mood: Optional[str] = Field(None, description="情绪标签；传空字符串表示清除")


# ==================== 内容安全相关 Schema ====================


class ReportCreate(BaseModel):
    """举报创作请求体"""

    reason: str = Field(..., description="举报理由分类")
    detail: Optional[str] = Field(None, max_length=200, description="补充说明")
    block_author: bool = Field(True, description="举报的同时拉黑作者，默认勾选")


class ReportResponse(BaseModel):
    """举报结果"""

    id: int
    ticket_no: str
    target_type: str
    target_id: int
    reason: str
    detail: Optional[str] = None
    status: str
    created_at: datetime
    block_created: bool = False

    class Config:
        from_attributes = True


class ReportListItem(ReportResponse):
    """我的举报列表项，额外带上被举报内容摘要。"""

    target_excerpt: Optional[str] = None
    target_author: Optional[str] = None


class BlockedUserResponse(BaseModel):
    """已拉黑用户"""

    user_id: int
    username: str
    blocked_at: datetime


class StatusHistoryItem(BaseModel):
    """状态变更历史"""

    from_status: Optional[str] = None
    to_status: str
    reason: Optional[str] = None
    actor_type: str
    actor_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== 管理端 Schema ====================


class StaffLoginRequest(BaseModel):
    username: str
    password: str


class StaffToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class StaffReportTarget(BaseModel):
    """管理端按被举报对象聚合的一条记录"""

    target_type: str
    target_id: int
    report_count: int
    reporter_count: int
    latest_reason: str
    latest_at: datetime
    status: str
    post_status: Optional[str] = None
    post_visibility: Optional[str] = None
    post_excerpt: Optional[str] = None
    post_author: Optional[str] = None


class StaffReportDecision(BaseModel):
    """管理端处置动作"""

    action: Literal["ignore", "hide", "delete", "restore", "mark_reviewing", "resolve"]
    note: Optional[str] = Field(None, max_length=255)


class StaffPostStatusUpdate(BaseModel):
    """管理端设置创作状态"""

    status: Literal["normal", "pending", "hidden", "deleted"]
    reason: Optional[str] = Field(None, max_length=255)


# ==================== 分页相关 Schema ====================


class PaginatedResponse(BaseModel, Generic[T]):
    """分页响应模型"""

    items: List[T]
    total: int
    page: int
    limit: int
    total_pages: int
