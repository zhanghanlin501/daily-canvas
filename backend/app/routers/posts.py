"""
创作路由

包含发布、时间线、详情、随机漫步、可见性切换、状态历史与举报入口。
所有公开列表统一走 content_safety.public_posts_query，保证
「私密 / 待审 / 已隐藏 / 已删除 / 拉黑」的内容不会从任何一个公开入口漏出。
"""

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_optional_staff, get_optional_user
from ..content_safety import (
    RESTORE_WINDOW_DAYS,
    STATUS_DELETED,
    STATUS_NORMAL,
    VISIBILITIES,
    block_user,
    create_post_report,
    display_status_label,
    ensure_not_blocked,
    evaluate_auto_pending,
    get_status_history,
    is_post_visible_to,
    previous_status_before_deletion,
    record_creation_history,
    record_status_change,
)
from ..crud import (
    check_user_posted_today,
    create_post,
    get_mood_by_name,
    get_post_by_id,
    get_posts,
    get_random_post,
    get_user_posts,
)
from ..database import get_db
from ..models import DailyPost, StaffUser, User
from ..schemas import (
    PaginatedResponse,
    PostCreate,
    PostResponse,
    PostUpdate,
    ReportCreate,
    ReportResponse,
    StatusHistoryItem,
    VisibilityUpdate,
)
from ..time_utils import today_in_app_timezone

router = APIRouter(prefix="/posts", tags=["创作"])

# 内容编辑窗口：发布后 24 小时内
CONTENT_EDIT_WINDOW = timedelta(hours=24)
# 补写窗口：今天及前 3 天（第 4 天前拒绝）
BACKFILL_WINDOW_DAYS = 3
# 回收站恢复窗口：删除后 30 天内
RESTORE_WINDOW = timedelta(days=RESTORE_WINDOW_DAYS)


def _as_aware_utc(value: Optional[datetime]) -> Optional[datetime]:
    """把数据库读出的时间统一成带时区的 UTC，避免 naive/aware 相减报错。"""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def serialize_post(db: Session, post: DailyPost, viewer_id: Optional[int]) -> PostResponse:
    """统一序列化创作；作者本位字段只对作者本人返回。"""
    is_owner = viewer_id is not None and post.user_id == viewer_id
    mood_info = get_mood_by_name(db, post.mood) if post.mood else None

    can_edit_content = False
    if is_owner and post.status != STATUS_DELETED:
        created_at = _as_aware_utc(post.created_at)
        if created_at is not None:
            can_edit_content = datetime.now(timezone.utc) - created_at <= CONTENT_EDIT_WINDOW

    return PostResponse(
        id=post.id,
        user_id=post.user_id,
        content=post.content,
        mood=post.mood,
        post_date=post.post_date,
        created_at=post.created_at,
        updated_at=post.updated_at,
        edited_at=post.edited_at,
        deleted_at=post.deleted_at,
        deleted_by_author=post.deleted_by_author,
        visibility=post.visibility,
        status=post.status,
        user=post.user,
        mood_info=mood_info,
        display_status=display_status_label(post.status, post.visibility) if is_owner else None,
        can_edit_content=can_edit_content if is_owner else None,
    )


def _paginate(db: Session, posts, total: int, page: int, limit: int, viewer_id):
    total_pages = (total + limit - 1) // limit
    return PaginatedResponse(
        items=[serialize_post(db, post, viewer_id) for post in posts],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.get("", response_model=PaginatedResponse[PostResponse])
async def get_timeline(
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    viewer: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """
    获取公开时间线（无需登录）。

    只返回 status=normal 且 visibility=public 的内容；私密内容不计入 total。
    携带有效 token 时会额外排除与查看者存在拉黑关系的作者。
    """
    viewer_id = viewer.id if viewer else None
    posts, total = get_posts(db, page=page, limit=limit, viewer_id=viewer_id)
    return _paginate(db, posts, total, page, limit, viewer_id)


@router.get("/me", response_model=PaginatedResponse[PostResponse])
async def get_my_posts(
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    获取当前用户的创作列表（作者视角）。

    包含「仅自己可见 / 审核中 / 已隐藏」的内容并带状态徽标；
    已删除内容进入回收站，不在这里返回。
    """
    posts, total = get_user_posts(
        db, user_id=current_user.id, page=page, limit=limit, viewer_id=current_user.id
    )
    return _paginate(db, posts, total, page, limit, current_user.id)


@router.get("/today", response_model=PostResponse)
async def get_my_today_post(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """返回当前用户今天的创作（若存在），供发布页做入口预防。"""
    business_date = today_in_app_timezone()
    post = (
        db.query(DailyPost)
        .filter(
            DailyPost.user_id == current_user.id,
            DailyPost.post_date == business_date,
        )
        .first()
    )

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="今天还没有创作",
        )

    return serialize_post(db, post, current_user.id)


@router.get("/date/{target_date}", response_model=PostResponse)
async def get_my_post_by_date(
    target_date: date,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前用户指定业务日期的创作（含回收站内容，供补写入口判断）。"""
    today = today_in_app_timezone()
    if target_date > today:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能查看未来日期")
    if target_date < today - timedelta(days=BACKFILL_WINDOW_DAYS):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="最多可补写最近 3 天")

    post = (
        db.query(DailyPost)
        .filter(
            DailyPost.user_id == current_user.id,
            DailyPost.post_date == target_date,
        )
        .first()
    )
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="这一天还没有创作")

    return serialize_post(db, post, current_user.id)


@router.get("/trash", response_model=PaginatedResponse[PostResponse])
async def list_trash_posts(
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    回收站：只返回作者本人删除的内容，删除后 30 天内可恢复。

    注意路由顺序：必须声明在 `/{post_id}` 之前，否则 `trash` 会被当成 ID。
    """
    query = db.query(DailyPost).filter(
        DailyPost.user_id == current_user.id,
        DailyPost.status == STATUS_DELETED,
        DailyPost.deleted_by_author.is_(True),
    )
    total = query.count()
    posts = (
        query.order_by(DailyPost.deleted_at.desc().nullslast(), DailyPost.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return _paginate(db, posts, total, page, limit, current_user.id)


@router.post("", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_new_post(
    post_data: PostCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    发布今日创作。

    严格每天一条（公开或私密都占用当天的名额）；校验顺序为
    内容 → 情绪 → 可见性 → 是否已发布，避免「当天已发」掩盖其他非法输入。
    """
    if post_data.visibility not in VISIBILITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="可见性参数不合法",
        )

    if post_data.mood:
        if not get_mood_by_name(db, post_data.mood):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无效的情绪标签",
            )

    business_date = today_in_app_timezone()
    target_date = post_data.post_date or business_date

    if target_date > business_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能发布未来日期的创作",
        )
    if target_date < business_date - timedelta(days=BACKFILL_WINDOW_DAYS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="最多可补写最近 3 天，不能补写更早的日期",
        )

    existing = (
        db.query(DailyPost)
        .filter(
            DailyPost.user_id == current_user.id,
            DailyPost.post_date == target_date,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="这一天已经写过了，每天只能写一条",
        )

    try:
        post = create_post(
            db,
            current_user.id,
            post_data,
            post_date=target_date,
            visibility=post_data.visibility,
        )
        record_creation_history(db, post)
        db.commit()
        db.refresh(post)
    except IntegrityError:
        # 并发请求可能同时通过检查，最终由数据库唯一约束兜底
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="这一天已经写过了，请查看或修改已有创作",
        )

    return serialize_post(db, post, current_user.id)


@router.get("/random", response_model=PostResponse)
async def get_random_explore(
    exclude_id: Optional[int] = Query(None, description="排除上一条，避免紧邻重复"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """随机漫步：只从公开内容里抽一条，并排除拉黑关系。"""
    post = get_random_post(db, viewer_id=current_user.id, exclude_id=exclude_id)

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="暂时没有可以探索的创作",
        )

    return serialize_post(db, post, current_user.id)


@router.get("/{post_id}", response_model=PostResponse)
async def get_post_detail(
    post_id: int,
    viewer: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """
    获取单条创作详情。

    非公开、非正常的内容对非作者一律返回 404，不暴露「这条内容存在」。
    """
    post = get_post_by_id(db, post_id)
    viewer_id = viewer.id if viewer else None

    if not post or not is_post_visible_to(db, post, viewer_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="创作不存在",
        )

    return serialize_post(db, post, viewer_id)


@router.patch("/{post_id}/visibility", response_model=PostResponse)
async def update_post_visibility(
    post_id: int,
    payload: VisibilityUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    切换公开 / 仅自己可见。

    与内容编辑是两个独立流程：可见性调整不受 24 小时编辑窗口限制，随时可用。
    """
    post = get_post_by_id(db, post_id)
    if not post or post.status == STATUS_DELETED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="创作不存在")

    if post.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能调整自己的创作",
        )

    if payload.visibility not in VISIBILITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="可见性参数不合法",
        )

    if post.visibility != payload.visibility:
        post.visibility = payload.visibility
        db.commit()
        db.refresh(post)

    return serialize_post(db, post, current_user.id)


@router.patch("/{post_id}", response_model=PostResponse)
async def update_post_content(
    post_id: int,
    payload: PostUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    内容编辑：只在发布后 24 小时内可用。

    与可见性切换严格分开：这里只改内容与情绪，超窗返回 409，
    并提示用户仍可以通过 `PATCH /posts/{id}/visibility` 调整可见性。
    """
    post = get_post_by_id(db, post_id)
    if not post or post.status == STATUS_DELETED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="创作不存在")

    if post.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能编辑自己的创作")

    changed_fields = set(payload.model_fields_set)
    if not changed_fields & {"content", "mood"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="没有需要修改的内容")

    # 情绪校验优先于窗口校验，和发布时的错误优先级保持一致
    new_mood = post.mood
    if "mood" in changed_fields:
        raw_mood = (payload.mood or "").strip()
        if raw_mood:
            if get_mood_by_name(db, raw_mood) is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="无效的情绪标签",
                )
            new_mood = raw_mood
        else:
            # 传空字符串表示清除情绪
            new_mood = None

    created_at = _as_aware_utc(post.created_at)
    if created_at is None or datetime.now(timezone.utc) - created_at > CONTENT_EDIT_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="内容编辑窗口已过（发布后 24 小时内可改），你仍然可以随时调整可见性",
        )

    changed = False
    if "content" in changed_fields and payload.content is not None:
        new_content = payload.content.strip()
        if not new_content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="创作内容不能为空",
            )
        if new_content != post.content:
            post.content = new_content
            changed = True

    if new_mood != post.mood:
        post.mood = new_mood
        changed = True

    if changed:
        post.edited_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(post)

    return serialize_post(db, post, current_user.id)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """作者软删除：内容进入回收站，公开入口立即消失，30 天内可恢复。"""
    post = get_post_by_id(db, post_id)
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="创作不存在")

    if post.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能删除自己的创作")

    if post.status == STATUS_DELETED:
        # 重复删除保持幂等
        return None

    record_status_change(
        db,
        post,
        STATUS_DELETED,
        reason="作者删除，进入回收站",
        actor_type="user",
        actor_id=current_user.id,
        commit=False,
    )
    post.deleted_at = datetime.now(timezone.utc)
    post.deleted_by_author = True
    db.commit()
    return None


@router.post("/{post_id}/restore", response_model=PostResponse)
async def restore_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    从回收站恢复：删除后 30 天内可用。

    恢复会回到删除前的状态；如果删除前是被管理端隐藏/待审的，恢复后仍然保持该状态，
    作者不能借「删除 → 恢复」绕过处置。
    """
    post = get_post_by_id(db, post_id)
    if not post or post.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="创作不存在")

    if post.status != STATUS_DELETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="这条创作没有被删除，无需恢复",
        )

    if not post.deleted_by_author:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="创作不存在或不可恢复",
        )

    deleted_at = _as_aware_utc(post.deleted_at)
    if deleted_at is not None and datetime.now(timezone.utc) - deleted_at > RESTORE_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="已超过 30 天恢复期，这条创作无法恢复",
        )

    target_status = previous_status_before_deletion(db, post.id) or STATUS_NORMAL
    record_status_change(
        db,
        post,
        target_status,
        reason="作者从回收站恢复",
        actor_type="user",
        actor_id=current_user.id,
        commit=False,
    )
    post.deleted_at = None
    post.deleted_by_author = False
    db.commit()
    db.refresh(post)

    return serialize_post(db, post, current_user.id)


@router.get("/{post_id}/status-history", response_model=list[StatusHistoryItem])
async def read_post_status_history(
    post_id: int,
    viewer: Optional[User] = Depends(get_optional_user),
    staff: Optional[StaffUser] = Depends(get_optional_staff),
    db: Session = Depends(get_db),
):
    """查看状态变更历史；仅作者本人与管理端可读。"""
    post = get_post_by_id(db, post_id)
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="创作不存在")

    is_owner = viewer is not None and post.user_id == viewer.id
    if not is_owner and staff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="创作不存在")

    return get_status_history(db, post_id)


@router.post(
    "/{post_id}/report",
    response_model=ReportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def report_post(
    post_id: int,
    payload: ReportCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    举报一条创作。

    - 同一用户对同一内容只能举报一次；
    - 单用户 24 小时内最多 20 次；
    - 同一内容被 5 名不同用户举报后自动进入待审并从所有公开入口隐藏；
    - `block_author` 为真时同时拉黑作者（默认勾选）。
    """
    post = get_post_by_id(db, post_id)
    if not post or not is_post_visible_to(db, post, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="创作不存在")

    if post.user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能举报自己的创作",
        )

    ensure_not_blocked(db, current_user.id, post.user_id)

    report = create_post_report(
        db,
        post=post,
        reporter=current_user,
        reason=payload.reason,
        detail=payload.detail,
    )

    block_created = False
    if payload.block_author:
        block_created = block_user(db, current_user.id, post.user_id)

    evaluate_auto_pending(db, post)
    db.commit()
    db.refresh(report)

    return ReportResponse(
        id=report.id,
        ticket_no=report.ticket_no,
        target_type=report.target_type,
        target_id=report.target_id,
        reason=report.reason,
        detail=report.detail,
        status=report.status,
        created_at=report.created_at,
        block_created=block_created,
    )
