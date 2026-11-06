"""
内容安全与用户保护

这一层集中承载三件事，避免各接口自己拼 SQL 导致过滤口径不一致：

1. **创作状态机**：`visibility`（作者意图）与 `status`（平台裁定）两条正交轴，
   每次状态变化写入 `post_status_history`。
2. **统一公开查询入口** `public_posts_query`：时间线、随机漫步、个人主页等
   所有公开位置都必须走这里，只有 `status=normal` 且 `visibility=public`
   且不涉及拉黑关系的内容才会出现。
3. **举报与拉黑**：举报去重、24 小时上限、≥5 名不同用户举报自动待审；
   拉黑单向记录、双向隔离。
"""

from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional
from uuid import uuid4

from fastapi import HTTPException, status as http_status
from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from .models import Block, DailyPost, ModerationAction, PostStatusHistory, Report, User

# ==================== 常量 ====================

VISIBILITY_PUBLIC = "public"
VISIBILITY_PRIVATE = "private"
VISIBILITIES = (VISIBILITY_PUBLIC, VISIBILITY_PRIVATE)

STATUS_NORMAL = "normal"
STATUS_PENDING = "pending"
STATUS_HIDDEN = "hidden"
STATUS_DELETED = "deleted"
POST_STATUSES = (STATUS_NORMAL, STATUS_PENDING, STATUS_HIDDEN, STATUS_DELETED)

# 展示给用户的 5 种状态：正常 / 仅自己可见 / 审核中 / 已隐藏 / 已删除
DISPLAY_STATUS_LABELS = {
    (STATUS_NORMAL, VISIBILITY_PUBLIC): "正常",
    (STATUS_NORMAL, VISIBILITY_PRIVATE): "仅自己可见",
    (STATUS_PENDING, VISIBILITY_PUBLIC): "审核中",
    (STATUS_PENDING, VISIBILITY_PRIVATE): "审核中",
    (STATUS_HIDDEN, VISIBILITY_PUBLIC): "已隐藏",
    (STATUS_HIDDEN, VISIBILITY_PRIVATE): "已隐藏",
    (STATUS_DELETED, VISIBILITY_PUBLIC): "已删除",
    (STATUS_DELETED, VISIBILITY_PRIVATE): "已删除",
}

# 举报理由分类（与 PRD 6.7 FR-17 一致）
REPORT_REASONS = (
    "色情低俗",
    "暴力血腥",
    "辱骂攻击",
    "广告引流",
    "违法违规",
    "侵犯版权",
    "其他",
)

# 同一条内容被多少名不同用户举报后自动进入待审
PENDING_REPORT_THRESHOLD = 5
# 单用户 24 小时内举报上限
REPORT_DAILY_LIMIT = 20
# 单用户最多拉黑人数
MAX_BLOCKS_PER_USER = 1000

# 作者删除后的回收站恢复窗口
RESTORE_WINDOW_DAYS = 30


def display_status_label(status_value: str, visibility: str) -> str:
    """把 (status, visibility) 映射成用户能看懂的一个状态。"""
    return DISPLAY_STATUS_LABELS.get(
        (status_value, visibility),
        "正常" if status_value == STATUS_NORMAL else status_value,
    )


# ==================== 拉黑 ====================

def blocked_user_ids(db: Session, user_id: Optional[int]) -> set[int]:
    """
    返回与 user_id 之间存在拉黑关系的用户集合。

    拉黑是单向记录、双向隔离：既包含 user_id 拉黑的人，也包含拉黑 user_id 的人。
    """
    if user_id is None:
        return set()

    rows = (
        db.query(Block.blocker_id, Block.blocked_id)
        .filter(or_(Block.blocker_id == user_id, Block.blocked_id == user_id))
        .all()
    )

    ids: set[int] = set()
    for blocker_id, blocked_id in rows:
        ids.add(blocker_id)
        ids.add(blocked_id)
    ids.discard(user_id)
    return ids


def is_blocked_between(db: Session, first_user_id: int, second_user_id: int) -> bool:
    """两个用户之间任一方向存在拉黑即视为互相隔离。"""
    if first_user_id == second_user_id:
        return False

    return (
        db.query(Block.id)
        .filter(
            or_(
                (Block.blocker_id == first_user_id) & (Block.blocked_id == second_user_id),
                (Block.blocker_id == second_user_id) & (Block.blocked_id == first_user_id),
            )
        )
        .first()
        is not None
    )


def block_user(db: Session, blocker_id: int, blocked_id: int) -> bool:
    """建立拉黑关系；幂等，重复调用不报错。返回是否新建。"""
    if blocker_id == blocked_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="不能拉黑自己",
        )

    existing = (
        db.query(Block)
        .filter(Block.blocker_id == blocker_id, Block.blocked_id == blocked_id)
        .first()
    )
    if existing:
        return False

    total = db.query(Block).filter(Block.blocker_id == blocker_id).count()
    if total >= MAX_BLOCKS_PER_USER:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"拉黑名单已达上限（{MAX_BLOCKS_PER_USER} 人），请先解除部分拉黑",
        )

    db.add(Block(blocker_id=blocker_id, blocked_id=blocked_id))
    db.commit()
    return True


def unblock_user(db: Session, blocker_id: int, blocked_id: int) -> bool:
    """解除拉黑；幂等，重复解除不报错。返回是否删除了记录。"""
    deleted = (
        db.query(Block)
        .filter(Block.blocker_id == blocker_id, Block.blocked_id == blocked_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return bool(deleted)


# ==================== 统一公开查询入口 ====================

def public_posts_query(db: Session, viewer_id: Optional[int] = None) -> Query:
    """
    公开内容的唯一入口：只有 normal + public，且不涉及查看者的拉黑关系。

    时间线、随机漫步、作者主页、搜索等公开位置都必须复用本函数，
    禁止各接口自行拼 `WHERE`，否则过滤口径会逐渐漂移。
    """
    query = db.query(DailyPost).filter(
        DailyPost.status == STATUS_NORMAL,
        DailyPost.visibility == VISIBILITY_PUBLIC,
    )

    blocked_ids = blocked_user_ids(db, viewer_id)
    if blocked_ids:
        query = query.filter(~DailyPost.user_id.in_(blocked_ids))

    return query


def is_post_visible_to(db: Session, post: DailyPost, viewer_id: Optional[int]) -> bool:
    """判断某条内容对某个查看者是否可见（作者本人可见自己的全部内容）。"""
    if viewer_id is not None and post.user_id == viewer_id:
        return True

    if post.status != STATUS_NORMAL or post.visibility != VISIBILITY_PUBLIC:
        return False

    if viewer_id is None:
        return True

    return post.user_id not in blocked_user_ids(db, viewer_id)


# ==================== 状态机 ====================

def record_status_change(
    db: Session,
    post: DailyPost,
    to_status: str,
    reason: Optional[str] = None,
    actor_type: str = "system",
    actor_id: Optional[int] = None,
    commit: bool = True,
) -> bool:
    """
    变更创作状态并留痕。

    幂等：目标状态与当前状态相同时不写历史、不重复处理，直接返回 False。
    """
    if to_status not in POST_STATUSES:
        raise ValueError(f"未知的创作状态：{to_status}")

    from_status = post.status
    if from_status == to_status:
        return False

    db.add(
        PostStatusHistory(
            post_id=post.id,
            from_status=from_status,
            to_status=to_status,
            reason=reason,
            actor_type=actor_type,
            actor_id=actor_id,
        )
    )
    post.status = to_status
    if commit:
        db.commit()
        db.refresh(post)
    return True


def record_creation_history(db: Session, post: DailyPost) -> None:
    """发布成功时写入一条「新建 → normal」的留痕。"""
    db.add(
        PostStatusHistory(
            post_id=post.id,
            from_status=None,
            to_status=post.status,
            reason="发布成功，默认进入正常状态",
            actor_type="system",
            actor_id=None,
        )
    )


def get_status_history(db: Session, post_id: int) -> list[PostStatusHistory]:
    """按时间正序返回某条创作的状态变化记录。"""
    return (
        db.query(PostStatusHistory)
        .filter(PostStatusHistory.post_id == post_id)
        .order_by(PostStatusHistory.created_at.asc(), PostStatusHistory.id.asc())
        .all()
    )


def previous_status_before_deletion(db: Session, post_id: int) -> str:
    """
    取「进入 deleted 之前」的状态，供回收站恢复时沿用。

    这样作者恢复内容时不会覆盖平台的裁定：例如内容先被管理端隐藏、
    作者随后自己删除，恢复后仍然保持 hidden，而不是变回 normal。
    """
    last_deletion = (
        db.query(PostStatusHistory)
        .filter(
            PostStatusHistory.post_id == post_id,
            PostStatusHistory.to_status == STATUS_DELETED,
        )
        .order_by(PostStatusHistory.created_at.desc(), PostStatusHistory.id.desc())
        .first()
    )

    if last_deletion and last_deletion.from_status in POST_STATUSES:
        return last_deletion.from_status

    return STATUS_NORMAL


def record_moderation_action(
    db: Session,
    target_type: str,
    target_id: int,
    action: str,
    operator_id: Optional[int],
    note: Optional[str] = None,
) -> ModerationAction:
    """记录一次人工处置。"""
    record = ModerationAction(
        target_type=target_type,
        target_id=target_id,
        action=action,
        operator_id=operator_id,
        note=note,
    )
    db.add(record)
    return record


def evaluate_auto_pending(db: Session, post: DailyPost) -> bool:
    """
    判断某条内容是否达到自动待审阈值。

    达到阈值且当前仍是 normal 时才置为 pending；返回是否发生了状态变化。
    """
    distinct_reporters = (
        db.query(Report.reporter_id)
        .filter(Report.target_type == "post", Report.target_id == post.id)
        .distinct()
        .count()
    )

    if distinct_reporters < PENDING_REPORT_THRESHOLD:
        return False

    if post.status != STATUS_NORMAL:
        return False

    return record_status_change(
        db,
        post,
        STATUS_PENDING,
        reason=f"被 {distinct_reporters} 名不同用户举报，自动进入待审",
        actor_type="system",
        actor_id=None,
        commit=False,
    )


def ensure_not_blocked(db: Session, actor_id: int, target_user_id: int) -> None:
    """拉黑关系下禁止互动，统一返回 403。"""
    if is_blocked_between(db, actor_id, target_user_id):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="你们之间已互相屏蔽，无法进行该操作",
        )


# ==================== 举报 ====================

def _count_reports_in_last_day(db: Session, reporter_id: int) -> int:
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    return (
        db.query(Report)
        .filter(Report.reporter_id == reporter_id, Report.created_at >= since)
        .count()
    )


def create_post_report(
    db: Session,
    post: DailyPost,
    reporter: User,
    reason: str,
    detail: Optional[str] = None,
) -> Report:
    """
    创建举报记录。

    - 同一用户对同一创作只能举报一次；
    - 单用户 24 小时内最多举报 20 次；
    - 达到阈值后由调用方触发自动待审。
    """
    if reason not in REPORT_REASONS:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="举报理由不合法",
        )

    if post.user_id == reporter.id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="不能举报自己的创作",
        )

    existing = (
        db.query(Report)
        .filter(
            Report.reporter_id == reporter.id,
            Report.target_type == "post",
            Report.target_id == post.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="你已举报过该内容，我们会尽快处理",
        )

    if _count_reports_in_last_day(db, reporter.id) >= REPORT_DAILY_LIMIT:
        raise HTTPException(
            status_code=http_status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"24 小时内举报次数已达上限（{REPORT_DAILY_LIMIT} 次），请稍后再试",
        )

    report = Report(
        target_type="post",
        target_id=post.id,
        reporter_id=reporter.id,
        reason=reason,
        detail=detail,
        status="pending",
        ticket_no=f"PENDING-{uuid4().hex}",
    )
    db.add(report)
    db.flush()

    report.ticket_no = f"DC-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{report.id:04d}"
    return report


def aggregate_reports_by_target(db: Session) -> list[dict]:
    """管理端举报队列：按被举报对象聚合。"""
    rows = (
        db.query(Report)
        .order_by(Report.created_at.desc())
        .all()
    )

    grouped: dict[tuple[str, int], dict] = {}
    for report in rows:
        key = (report.target_type, report.target_id)
        bucket = grouped.get(key)
        if bucket is None:
            bucket = {
                "target_type": report.target_type,
                "target_id": report.target_id,
                "report_count": 0,
                "reporter_ids": set(),
                "latest_reason": report.reason,
                "latest_at": report.created_at,
                "status": report.status,
                "report_ids": [],
                "ticket_nos": [],
            }
            grouped[key] = bucket

        bucket["report_count"] += 1
        bucket["reporter_ids"].add(report.reporter_id)
        bucket["report_ids"].append(report.id)
        bucket["ticket_nos"].append(report.ticket_no)

    results = []
    for bucket in grouped.values():
        bucket["reporter_count"] = len(bucket["reporter_ids"])
        bucket.pop("reporter_ids", None)
        results.append(bucket)

    results.sort(key=lambda item: item["latest_at"], reverse=True)
    return results


def iter_report_reasons() -> Iterable[str]:
    return REPORT_REASONS
