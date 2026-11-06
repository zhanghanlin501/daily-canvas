"""
Routers 模块
"""

from .auth import router as auth_router
from .posts import router as posts_router
from .moods import router as moods_router
from .safety import router as safety_router
from .staff import router as staff_router

__all__ = ["auth_router", "posts_router", "moods_router", "safety_router", "staff_router"]
