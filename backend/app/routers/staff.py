"""
管理端路由（最小可用）

- 管理端账号登录
- 举报队列（按被举报对象聚合）
- 处置动作：忽略 / 隐藏 / 删除 / 恢复 / 转处理中 / 直接解决
- 直接设置创作状态

所有处置都会写入 `moderation_actions`，状态变化写入 `post_status_history`。
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..auth import create_staff_access_token, get_current_staff, verify_password
from ..content_safety import (
    STATUS_DELETED,
    STATUS_HIDDEN,
    STATUS_NORMAL,
    STATUS_PENDING,
    POST_STATUSES,
    aggregate_reports_by_target,
    record_moderation_action,
    record_status_change,
)
from ..crud import get_post_by_id
from ..database import get_db
from ..rate_limit import (
    LOGIN_IP_LIMITER,
    STAFF_LOGIN_ACCOUNT_LIMITER,
    client_ip,
    enforce,
    too_many_requests,
)
from ..models import Report, StaffUser
from ..schemas import (
    StaffLoginRequest,
    StaffPostStatusUpdate,
    StaffReportDecision,
    StaffReportTarget,
    StaffToken,
)

router = APIRouter(prefix="/staff", tags=["管理端"])

# 处置动作 → 创作状态（None 表示不改创作状态）
DECISION_TO_POST_STATUS = {
    "hide": STATUS_HIDDEN,
    "delete": STATUS_DELETED,
    "restore": STATUS_NORMAL,
    "pending": STATUS_PENDING,
}

DECISION_TO_REPORT_STATUS = {
    "ignore": "rejected",
    "hide": "resolved",
    "delete": "resolved",
    "restore": "resolved",
    "resolve": "resolved",
    "mark_reviewing": "reviewing",
}


@router.post("/login", response_model=StaffToken)
async def staff_login(payload: StaffLoginRequest, request: Request, db: Session = Depends(get_db)):
    """管理端登录；账号由 STAFF_USERNAME / STAFF_PASSWORD 环境变量创建。"""
    # 管理端是公开隧道上的高价值入口，失败次数限制比普通登录更严格
    staff_key = f"staff-login:{payload.username.strip().lower()}"
    ip_key = f"staff-login-ip:{client_ip(request)}"
    enforce(STAFF_LOGIN_ACCOUNT_LIMITER, staff_key, "该管理账号密码错误次数过多，请稍后再试")
    enforce(LOGIN_IP_LIMITER, ip_key, "登录尝试过于频繁，请稍后再试")

    staff = db.query(StaffUser).filter(StaffUser.username == payload.username).first()

    if staff is None or not verify_password(payload.password, staff.password_hash):
        retry_after = max(
            STAFF_LOGIN_ACCOUNT_LIMITER.record_attempt(staff_key),
            LOGIN_IP_LIMITER.record_attempt(ip_key),
        )
        if retry_after > 0:
            raise too_many_requests(retry_after, "密码错误次数过多，请稍后再试")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号或密码错误",
        )

    STAFF_LOGIN_ACCOUNT_LIMITER.clear(staff_key)

    return StaffToken(
        access_token=create_staff_access_token({"sub": staff.id, "role": staff.role}),
        role=staff.role,
    )


@router.get("/reports", response_model=list[StaffReportTarget])
async def list_report_queue(
    _: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    """举报队列：同一对象的多条举报聚合为一条，附带被举报内容的当前状态。"""
    aggregated = aggregate_reports_by_target(db)

    results: list[StaffReportTarget] = []
    for item in aggregated:
        post = get_post_by_id(db, item["target_id"]) if item["target_type"] == "post" else None
        results.append(
            StaffReportTarget(
                target_type=item["target_type"],
                target_id=item["target_id"],
                report_count=item["report_count"],
                reporter_count=item["reporter_count"],
                latest_reason=item["latest_reason"],
                latest_at=item["latest_at"],
                status=item["status"],
                post_status=post.status if post else None,
                post_visibility=post.visibility if post else None,
                post_excerpt=(
                    post.content[:60] + ("…" if len(post.content) > 60 else "")
                    if post
                    else None
                ),
                post_author=post.user.username if post and post.user else None,
            )
        )

    return results


def _reports_of_target(db: Session, target_type: str, target_id: int) -> list[Report]:
    return (
        db.query(Report)
        .filter(Report.target_type == target_type, Report.target_id == target_id)
        .all()
    )


@router.patch("/reports/{report_id}", response_model=StaffReportTarget)
async def decide_report(
    report_id: int,
    payload: StaffReportDecision,
    staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    """处置某条举报：动作会应用到同一被举报对象的全部举报记录。"""
    report = db.query(Report).filter(Report.id == report_id).first()
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="举报记录不存在")

    reports = _reports_of_target(db, report.target_type, report.target_id)

    new_post_status = DECISION_TO_POST_STATUS.get(payload.action)
    if new_post_status is not None and report.target_type == "post":
        post = get_post_by_id(db, report.target_id)
        if post is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="被举报内容不存在")

        record_status_change(
            db,
            post,
            new_post_status,
            reason=payload.note or f"管理端处置：{payload.action}",
            actor_type="staff",
            actor_id=staff.id,
            commit=False,
        )
        if new_post_status == STATUS_DELETED:
            post.deleted_at = datetime.now(timezone.utc)
            post.deleted_by_author = False
        else:
            post.deleted_at = None
            post.deleted_by_author = False

    target_report_status = DECISION_TO_REPORT_STATUS[payload.action]
    for item in reports:
        item.status = target_report_status

    record_moderation_action(
        db,
        target_type=report.target_type,
        target_id=report.target_id,
        action=payload.action,
        operator_id=staff.id,
        note=payload.note,
    )
    db.commit()

    post = get_post_by_id(db, report.target_id) if report.target_type == "post" else None
    return StaffReportTarget(
        target_type=report.target_type,
        target_id=report.target_id,
        report_count=len(reports),
        reporter_count=len({item.reporter_id for item in reports}),
        latest_reason=report.reason,
        latest_at=report.created_at,
        status=target_report_status,
        post_status=post.status if post else None,
        post_visibility=post.visibility if post else None,
        post_excerpt=(
            post.content[:60] + ("…" if len(post.content) > 60 else "") if post else None
        ),
        post_author=post.user.username if post and post.user else None,
    )


@router.patch("/posts/{post_id}/status", response_model=StaffReportTarget)
async def set_post_status(
    post_id: int,
    payload: StaffPostStatusUpdate,
    staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    """管理端直接设置创作状态（待审 / 隐藏 / 恢复 / 强制删除）。"""
    if payload.status not in POST_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="状态不合法")

    post = get_post_by_id(db, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="创作不存在")

    changed = record_status_change(
        db,
        post,
        payload.status,
        reason=payload.reason or "管理端设置状态",
        actor_type="staff",
        actor_id=staff.id,
        commit=False,
    )
    if payload.status == STATUS_DELETED:
        # 管理端强制删除：记录删除时间，但不允许作者从回收站自行恢复。
        post.deleted_at = datetime.now(timezone.utc)
        post.deleted_by_author = False
    else:
        # 管理端恢复/隐藏/待审都意味着该内容不应继续停留在作者回收站。
        post.deleted_at = None
        post.deleted_by_author = False
    record_moderation_action(
        db,
        target_type="post",
        target_id=post.id,
        action=f"set_status:{payload.status}",
        operator_id=staff.id,
        note=payload.reason,
    )
    db.commit()
    db.refresh(post)

    return StaffReportTarget(
        target_type="post",
        target_id=post.id,
        report_count=0,
        reporter_count=0,
        latest_reason="manual",
        latest_at=post.updated_at or post.created_at,
        status="resolved" if changed else "unchanged",
        post_status=post.status,
        post_visibility=post.visibility,
        post_excerpt=post.content[:60] + ("…" if len(post.content) > 60 else ""),
        post_author=post.user.username if post.user else None,
    )
