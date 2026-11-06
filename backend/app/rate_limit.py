"""
轻量进程内限流（登录暴力破解防护）

背景：当前版本通过临时隧道（cloudflared）对公网开放，`/auth/login` 与
`/staff/login` 没有任何失败次数限制，攻击者可以无限次猜测密码。

约束：本版本仍是单 backend 容器 + 单进程 uvicorn，不引入 Redis 等外部依赖，
所以用进程内滑窗计数实现；将来横向扩容需要替换成共享存储实现。

隧道下所有外部流量在容器内都来自同一个 IP，因此**按账号**的计数是主要防线，
**按 IP** 的计数只作为宽松的兜底。
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from .config import settings


@dataclass(frozen=True)
class LimitRule:
    """一个限流规则：窗口内允许的失败次数与超限后的锁定时长。"""

    limit: int
    window_seconds: int
    lockout_seconds: int


_PRUNE_EVERY = 256
_PRUNE_THRESHOLD = 1024


class SlidingWindowLimiter:
    """按 key 统计窗口内的失败次数，超限后在 lockout 窗口内直接拒绝。"""

    def __init__(self, rule: LimitRule) -> None:
        self._rule = rule
        self._events: dict[str, deque[float]] = {}
        self._blocked_until: dict[str, float] = {}
        self._lock = threading.Lock()
        self._calls_since_prune = 0

    @property
    def rule(self) -> LimitRule:
        return self._rule

    def retry_after(self, key: str) -> int:
        """返回该 key 还需等待的秒数；0 表示当前允许尝试。"""
        now = time.monotonic()
        with self._lock:
            self._maybe_prune(now)
            blocked_until = self._blocked_until.get(key, 0.0)
            if blocked_until > now:
                return max(1, int(blocked_until - now + 0.999))
            return 0

    def record_attempt(self, key: str) -> int:
        """记录一次尝试；达到上限时开始锁定，返回需要等待的秒数（0 表示未锁定）。"""
        now = time.monotonic()
        with self._lock:
            self._maybe_prune(now)
            events = self._events.setdefault(key, deque())
            events.append(now)

            cutoff = now - self._rule.window_seconds
            while events and events[0] < cutoff:
                events.popleft()

            if len(events) > self._rule.limit:
                # 超限：进入锁定窗口并清空计数，避免锁定刚结束又被旧记录立刻顶满
                self._blocked_until[key] = now + self._rule.lockout_seconds
                events.clear()
                return self._rule.lockout_seconds

            return 0

    def clear(self, key: str) -> None:
        """成功后清空该 key 的失败记录。"""
        with self._lock:
            self._events.pop(key, None)
            self._blocked_until.pop(key, None)

    def _maybe_prune(self, now: float) -> None:
        self._calls_since_prune += 1
        if self._calls_since_prune < _PRUNE_EVERY and len(self._events) < _PRUNE_THRESHOLD:
            return

        self._calls_since_prune = 0
        cutoff = now - self._rule.window_seconds

        for key in list(self._events.keys()):
            events = self._events[key]
            while events and events[0] < cutoff:
                events.popleft()
            if not events:
                self._events.pop(key, None)

        for key in list(self._blocked_until.keys()):
            if self._blocked_until[key] <= now:
                self._blocked_until.pop(key, None)


def client_ip(request: Request) -> str:
    """取客户端 IP：优先 X-Forwarded-For 的第一跳，其次连接来源。"""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first

    if request.client and request.client.host:
        return request.client.host

    return "unknown"


def too_many_requests(retry_after: int, detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=detail,
        headers={"Retry-After": str(retry_after)},
    )


def enforce(limiter: SlidingWindowLimiter, key: str, detail: str) -> None:
    """进入敏感入口前调用：处于锁定中则直接抛 429。"""
    retry_after = limiter.retry_after(key)
    if retry_after > 0:
        raise too_many_requests(retry_after, detail)


# ==================== 具体限流器 ====================

LOGIN_ACCOUNT_LIMITER = SlidingWindowLimiter(
    LimitRule(
        limit=settings.LOGIN_MAX_FAILURES_PER_ACCOUNT,
        window_seconds=settings.LOGIN_WINDOW_SECONDS,
        lockout_seconds=settings.LOGIN_LOCKOUT_SECONDS,
    )
)

LOGIN_IP_LIMITER = SlidingWindowLimiter(
    LimitRule(
        limit=settings.LOGIN_MAX_FAILURES_PER_IP,
        window_seconds=settings.LOGIN_WINDOW_SECONDS,
        lockout_seconds=settings.LOGIN_IP_LOCKOUT_SECONDS,
    )
)

STAFF_LOGIN_ACCOUNT_LIMITER = SlidingWindowLimiter(
    LimitRule(
        limit=settings.STAFF_LOGIN_MAX_FAILURES_PER_ACCOUNT,
        window_seconds=settings.LOGIN_WINDOW_SECONDS,
        lockout_seconds=settings.STAFF_LOGIN_LOCKOUT_SECONDS,
    )
)

REGISTER_IP_LIMITER = SlidingWindowLimiter(
    LimitRule(
        limit=settings.REGISTER_MAX_ATTEMPTS_PER_IP,
        window_seconds=settings.REGISTER_WINDOW_SECONDS,
        lockout_seconds=settings.REGISTER_LOCKOUT_SECONDS,
    )
)
