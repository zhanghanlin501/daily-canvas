"""登录暴力破解与注册刷号防护的端到端回归。

运行方式见 `tests/run-e2e-tests.sh`。可用环境变量覆盖 `DC_API_BASE`。
注意：限流计数存在后端进程内存里，脚本会先重启 backend 再执行。
"""

import os
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = os.environ.get("DC_API_BASE", "http://localhost:8080/api")

results = []
created_emails = []


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


def register(email, username):
    created_emails.append(email)
    return call(
        "POST",
        "/auth/register",
        body={"username": username, "email": email, "password": "Passw0rd!23"},
    )


def login(email, password="Passw0rd!23"):
    return call("POST", "/auth/login", form={"username": email, "password": password})


suffix = uuid.uuid4().hex[:8]
email_a = f"rl_a_{suffix}@example.com"
email_b = f"rl_b_{suffix}@example.com"

code, payload, _ = register(email_a, f"rla{suffix}")
check("账号 A 注册成功", code == 201, (code, payload))

code, payload, _ = login(email_a)
check("账号 A 正常登录成功", code == 200 and bool(payload.get("access_token")), (code, payload))

wrong_statuses = []
for _ in range(8):
    code, _, _ = login(email_a, "WrongPass!23")
    wrong_statuses.append(code)
check("账号 A 连续 8 次密码错误仍返回 401", wrong_statuses == [401] * 8, wrong_statuses)

code, payload, headers = login(email_a, "WrongPass!23")
check("第 9 次密码错误触发限流返回 429", code == 429, (code, payload))


def header_value(headers, name):
    for key, value in headers.items():
        if key.lower() == name.lower():
            return value
    return None


retry_after_header = header_value(headers, "Retry-After")
check("429 响应带 Retry-After 头", str(retry_after_header or "").isdigit(), headers)

code, payload, _ = login(email_a)
check("锁定期间即使密码正确也被拒绝（429）", code == 429, (code, payload))

code, payload, _ = register(email_b, f"rlb{suffix}")
check("账号 B 注册成功", code == 201, (code, payload))

code, payload, _ = login(email_b)
check("账号 B 登录不受账号 A 锁定影响", code == 200 and bool(payload.get("access_token")), (code, payload))

for _ in range(5):
    code, payload, _ = call("POST", "/staff/login", body={"username": "nobody", "password": "WrongPass!23"})
    assert code == 401, (code, payload)
check("管理端连续 5 次密码错误仍返回 401", True)

code, payload, headers = call("POST", "/staff/login", body={"username": "nobody", "password": "WrongPass!23"})
check("管理端第 6 次密码错误触发限流返回 429", code == 429, (code, payload))

blocked_at = None
for index in range(1, 90):
    code, payload, _ = register(f"rl_c{index}_{suffix}@example.com", f"rlc{index}{suffix}")
    if code == 429:
        blocked_at = index
        break

total_registered = 2 + (blocked_at - 1) if blocked_at else None
check("注册入口达到阈值后返回 429", blocked_at is not None, blocked_at)
check("注册阈值与默认值一致（阈值 60，第 61 次被拦截）", total_registered == 60, total_registered)

code, _, _ = register(f"rl_d_{suffix}@example.com", f"rld{suffix}")
check("限流生效后继续注册仍被拒绝", code == 429, code)

print("\nSUMMARY", json.dumps({
    "total": len(results),
    "passed": sum(1 for _, ok, _ in results if ok),
    "failed": [name for name, ok, _ in results if not ok],
    "created_emails": created_emails,
}, ensure_ascii=False))

if any(not ok for _, ok, _ in results):
    raise SystemExit(1)
