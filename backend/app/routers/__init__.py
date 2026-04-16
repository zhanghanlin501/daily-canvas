"""
Routers 模块
"""

from .auth import router as auth_router
from .posts import router as posts_router
from .moods import router as moods_router

__all__ = ["auth_router", "posts_router", "moods_router"]