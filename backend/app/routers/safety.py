"""
内容安全与用户保护路由

- 我的举报记录与受理状态
- 拉黑 / 解除拉黑 / 已拉黑列表
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..content_safety import block_user, unblock_user
from ..crud import get_post_by_id, get_user_by_username
from ..database import get_db
from ..models import Block, Report, User
from ..schemas import BlockedUserResponse, ReportListItem

router = APIRouter(tags=["内容安全"])

REPORT_STATUS_LABELS = {
    "pending": "待处理",
    "reviewing": "处理中",
    "resolved": "已处理",
    "rejected": "不予处理",
}


@router.get("/reports/me", response_model=list[ReportListItem])
async def list_my_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """我的举报记录：含受理编号与当前状态。"""
    reports = (
        db.query(Report)
        .filter(Report.reporter_id == current_user.id)
        .order_by(Report.created_at.desc(), Report.id.desc())
        .all()
    )

    items: list[ReportListItem] = []
    for report in reports:
        post = get_post_by_id(db, report.target_id) if report.target_type == "post" else None
        excerpt = None
        author = None
        if post is not None:
            excerpt = post.content[:40] + ("…" if len(post.content) > 40 else "")
            author = post.user.username if post.user else None

        items.append(
            ReportListItem(
                id=report.id,
                ticket_no=report.ticket_no,
                target_type=report.target_type,
                target_id=report.target_id,
                reason=report.reason,
                detail=report.detail,
                status=report.status,
                created_at=report.created_at,
                target_excerpt=excerpt,
                target_author=author,
            )
        )

    return items


@router.get("/reports/reasons", response_model=list[str])
async def list_report_reasons():
    """举报理由分类，供前端下拉选择，避免前后端枚举漂移。"""
    from ..content_safety import REPORT_REASONS

    return list(REPORT_REASONS)


@router.get("/reports/status-labels", response_model=dict)
async def report_status_labels():
    """举报状态的中文标签。"""
    return REPORT_STATUS_LABELS


@router.post("/users/{username}/block", status_code=status.HTTP_200_OK)
async def block_author_by_username(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """拉黑指定用户；重复调用幂等返回成功。"""
    target = get_user_by_username(db, username)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    created = block_user(db, current_user.id, target.id)
    return {"blocked": True, "username": target.username, "created": created}


@router.delete("/users/{username}/block", status_code=status.HTTP_200_OK)
async def unblock_author_by_username(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """解除拉黑；重复调用幂等返回成功。"""
    target = get_user_by_username(db, username)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    removed = unblock_user(db, current_user.id, target.id)
    return {"blocked": False, "username": target.username, "removed": removed}


@router.get("/blocks/me", response_model=list[BlockedUserResponse])
async def list_my_blocks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """我已拉黑的用户列表（不含拉黑我的人，避免暴露对方身份）。"""
    rows = (
        db.query(Block, User)
        .join(User, Block.blocked_id == User.id)
        .filter(Block.blocker_id == current_user.id)
        .order_by(Block.created_at.desc())
        .all()
    )

    return [
        BlockedUserResponse(
            user_id=user.id,
            username=user.username,
            blocked_at=block.created_at,
        )
        for block, user in rows
    ]
