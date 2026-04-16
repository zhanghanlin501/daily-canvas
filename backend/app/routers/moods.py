"""
情绪路由
处理情绪标签相关的 API 请求
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..schemas import MoodResponse
from ..crud import get_moods

# 创建路由实例
router = APIRouter(prefix="/moods", tags=["情绪"])


@router.get("", response_model=List[MoodResponse])
async def list_moods(db: Session = Depends(get_db)):
    """
    获取所有可用的情绪标签

    公开接口
    """
    moods = get_moods(db)
    return moods