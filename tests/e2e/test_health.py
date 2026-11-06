"""健康检查契约回归：存活 / 就绪区分、请求追踪 ID。

运行方式见 `tests/run-e2e-tests.sh`。可用环境变量覆盖 `DC_API_BASE`。
"""

import json
import os
import urllib.error
import urllib.request

BASE = os.environ.get("DC_API_BASE", "http://localhost:8080/api")
results = []


def call(path):
    req = urllib.request.Request(BASE + path, method="GET")
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


def check(name, condition, extra=None):
    results.append((name, bool(condition), extra))
    print(("PASS " if condition else "FAIL ") + name + ("" if condition else f"  <-- {extra}"))


def header_value(headers, name):
    for key, value in headers.items():
        if key.lower() == name.lower():
            return value
    return None


code, payload, headers = call("/health")
check("存活检查返回 200", code == 200 and payload.get("status") == "healthy", (code, payload))

code, payload, headers = call("/health/ready")
check(
    "就绪检查返回 200 并带数据库状态",
    code == 200 and payload.get("status") == "ready" and payload.get("database") == "up",
    (code, payload),
)
check("响应带 X-Request-ID 便于链路排查", bool(header_value(headers, "X-Request-ID")), headers)

code, payload, _ = call("/health/ready")
check("就绪检查包含时区信息", payload.get("timezone") == "Asia/Shanghai", payload)

code, payload, _ = call("/posts")
check("公开接口仍可直接访问", code == 200 and "items" in payload, code)

code, payload, _ = call("/posts/random")
check("未登录访问随机漫步返回 401（探索属于登录后功能）", code == 401, (code, payload))

print("\nSUMMARY", json.dumps({
    "total": len(results),
    "passed": sum(1 for _, ok, _ in results if ok),
    "failed": [name for name, ok, _ in results if not ok],
}, ensure_ascii=False))

if any(not ok for _, ok, _ in results):
    raise SystemExit(1)
