"""双 Token 无感登录链路回归：下发、续期轮换、撤销与 401 契约。

运行方式见 `tests/run-e2e-tests.sh`。可用环境变量覆盖 `DC_API_BASE`。
"""

import os
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = os.environ.get("DC_API_BASE", "http://localhost:8080/api")
results = []


def call(method, path, token=None, body=None, form=None):
    headers = {}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = raw
        return exc.code, payload, dict(exc.headers)


def check(name, ok, extra=None):
    results.append((name, bool(ok), extra))
    print(("PASS " if ok else "FAIL ") + name, "" if ok else extra)


suffix = uuid.uuid4().hex[:8]
email = f"tok_{suffix}@example.com"

code, payload, _ = call(
    "POST",
    "/auth/register",
    body={"username": f"tok{suffix}", "email": email, "password": "Passw0rd!23"},
)
check("注册成功", code == 201, (code, payload))

code, login, _ = call("POST", "/auth/login", form={"username": email, "password": "Passw0rd!23"})
access, refresh = login.get("access_token"), login.get("refresh_token")
check("登录返回 access + refresh", code == 200 and bool(access) and bool(refresh), (code, login))
check("access 有效期 15 分钟", login.get("expires_in") == 900, login.get("expires_in"))
check("refresh 有效期 30 天", login.get("refresh_expires_in") == 30 * 24 * 3600, login.get("refresh_expires_in"))

code, me, _ = call("GET", "/auth/me", token=access)
check("access token 可访问 /auth/me", code == 200 and me.get("user", {}).get("email") == email, (code, me))

code, refreshed, _ = call("POST", "/auth/refresh", body={"refresh_token": refresh})
check("refresh 换到新 token 对", code == 200 and refreshed.get("refresh_token") != refresh, (code, refreshed))

code, _, _ = call("GET", "/auth/me", token=refreshed.get("access_token", ""))
check("新 access token 可用", code == 200, code)

code, _, _ = call("POST", "/auth/refresh", body={"refresh_token": refresh})
check("旧 refresh 复用被拒绝（轮换生效）", code == 401, code)

code, _, _ = call("GET", "/auth/me")
check("无 token 访问返回 401", code == 401, code)

code, _, _ = call("GET", "/auth/me", token="expired.garbage.token")
check("伪造 access token 返回 401（前端可据此触发静默续期）", code == 401, code)

code, _, _ = call("POST", "/auth/logout", body={"refresh_token": refreshed.get("refresh_token", "")})
check("登出返回 204", code == 204, code)

code, _, _ = call("POST", "/auth/refresh", body={"refresh_token": refreshed.get("refresh_token", "")})
check("登出后 refresh 被撤销", code == 401, code)

print("\nSUMMARY", json.dumps({
    "total": len(results),
    "passed": sum(1 for _, ok, _ in results if ok),
    "failed": [name for name, ok, _ in results if not ok],
    "email": email,
}, ensure_ascii=False))

if any(not ok for _, ok, _ in results):
    raise SystemExit(1)
