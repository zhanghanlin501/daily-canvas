"""
数据库初始化脚本
创建默认的情绪标签数据
"""

import sys
from pathlib import Path

# 将项目根目录添加到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from app.database import engine, SessionLocal, Base
from app.models import Mood


def init_moods(db: Session) -> None:
    """
    初始化默认的情绪标签
    """
    # 默认情绪标签
    default_moods = [
        {"name": "平静", "emoji": "😌", "color": "#e8f5e9"},
        {"name": "开心", "emoji": "😊", "color": "#fff3e0"},
        {"name": "感恩", "emoji": "🙏", "color": "#f3e5f5"},
        {"name": "兴奋", "emoji": "🎉", "color": "#ffeb3b"},
        {"name": "思考", "emoji": "🤔", "color": "#e3f2fd"},
        {"name": "疲惫", "emoji": "😴", "color": "#cfd8dc"},
        {"name": "期待", "emoji": "✨", "color": "#fff8e1"},
        {"name": "满足", "emoji": "🥰", "color": "#fce4ec"},
    ]

    # 检查是否已有情绪数据
    existing = db.query(Mood).first()
    if existing:
        print("情绪标签已存在，跳过初始化")
        return

    # 插入默认情绪
    for mood_data in default_moods:
        mood = Mood(**mood_data)
        db.add(mood)

    db.commit()
    print(f"已初始化 {len(default_moods)} 个情绪标签")


def main():
    """
    主函数 - 初始化数据库
    """
    print("开始初始化数据库...")

    # 创建所有表
    Base.metadata.create_all(bind=engine)
    print("数据库表创建完成")

    # 创建会话
    db = SessionLocal()

    try:
        # 初始化情绪标签
        init_moods(db)
    finally:
        db.close()

    print("数据库初始化完成！")


if __name__ == "__main__":
    main()