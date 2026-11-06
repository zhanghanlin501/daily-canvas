"""内容安全端到端回归：状态机、私密隔离、举报阈值、拉黑与最小管理端。

运行方式见 `tests/run-e2e-tests.sh`（会创建临时账号，跑完由脚本清理）。
可用环境变量覆盖：`DC_API_BASE`、`STAFF_USERNAME`、`STAFF_PASSWORD`。
"""

import os
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = os.environ.get("DC_API_BASE", "http://localhost:8080/api")
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

results = []
created_users = []
created_posts = []


def call(method, path, token=None, body=None, form=None, expect=None):
    url = f"{BASE}{path}"
    data = None
    headers = {}
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode() or "{}"
            payload = json.loads(raw) if raw else {}
            code = resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode() or "{}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"raw": raw}
        code = exc.code

    if expect is not None and code != expect:
        raise AssertionError(f"{method} {path} 期望 {expect} 实际 {code}: {payload}")
    return code, payload


def check(name, condition, extra=""):
    results.append((name, bool(condition), extra))
    print(("PASS " if condition else "FAIL ") + name + ("" if condition else f"  <-- {extra}"))


tag = uuid.uuid4().hex[:6]


def make_user(prefix):
    username = f"{prefix}_{tag}"
    email = f"{username}@example.com"
    code, payload = call(
        "POST", "/auth/register",
        body={"username": username, "email": email, "password": "Passw0rd!"},
        expect=201,
    )
    created_users.append(payload["id"])
    _, token_payload = call("POST", "/auth/login", form={"username": email, "password": "Passw0rd!"}, expect=200)
    return {"id": payload["id"], "username": username, "email": email, "token": token_payload["access_token"]}


author_pub = make_user("pub")
author_priv = make_user("priv")
reporters = [make_user(f"r{i}") for i in range(1, 6)]
viewer = make_user("viewer")
block_peer = make_user("peer")

# 发布
code, public_post = call(
    "POST", "/posts", token=author_pub["token"],
    body={"content": "公开创作-" + tag, "visibility": "public"}, expect=201,
)
created_posts.append(public_post["id"])
check("公开发布返回 normal + public", public_post["status"] == "normal" and public_post["visibility"] == "public", public_post)

code, private_post = call(
    "POST", "/posts", token=author_priv["token"],
    body={"content": "私密创作-" + tag, "visibility": "private"}, expect=201,
)
created_posts.append(private_post["id"])
check("私密发布返回 private", private_post["visibility"] == "private", private_post)

code, dup = call("POST", "/posts", token=author_priv["token"], body={"content": "第二条"}, )
check("同一天再次发布被拒绝", code == 409, f"{code} {dup}")

code, dup_mood = call("POST", "/posts", token=author_priv["token"], body={"content": "x", "mood": "不存在的标签"})
check("非法情绪优先于日期报错", code == 400 and "情绪" in json.dumps(dup_mood, ensure_ascii=False), f"{code} {dup_mood}")

# 私密内容隔离
code, feed = call("GET", "/posts", expect=200)
ids = {item["id"] for item in feed["items"]}
check("匿名时间线不含私密内容", private_post["id"] not in ids, feed.get("total"))
check("私密内容不计入公开统计", feed["total"] == len(ids), f"total={feed['total']} items={len(ids)}")

code, _ = call("GET", f"/posts/{private_post['id']}", token=viewer["token"])
check("他人访问私密详情返回 404", code == 404, code)

code, _ = call("GET", f"/posts/{private_post['id']}/status-history", token=viewer["token"])
check("他人读私密状态历史返回 404", code == 404, code)

code, mine = call("GET", "/posts/me", token=author_priv["token"], expect=200)
check(
    "作者本人能看到私密内容并带状态",
    any(item["id"] == private_post["id"] and item["display_status"] == "仅自己可见" for item in mine["items"]),
    mine["items"],
)
check("作者累计创作包含私密内容", mine["total"] == 1, mine["total"])

# 可见性任意时间可切换（把发布时间回拨 3 天）
print("BACKDATE_POST_ID", public_post["id"])

code, toggled = call("PATCH", f"/posts/{public_post['id']}/visibility", token=author_pub["token"], body={"visibility": "private"})
check("可见性切换（不改内容）成功", code == 200 and toggled["visibility"] == "private", toggled)
code, toggled = call("PATCH", f"/posts/{public_post['id']}/visibility", token=author_pub["token"], body={"visibility": "public"})
check("可见性可切回公开", code == 200 and toggled["visibility"] == "public", toggled)

code, forbidden = call("PATCH", f"/posts/{public_post['id']}/visibility", token=viewer["token"], body={"visibility": "private"})
check("他人不能改我的可见性", code == 403, f"{code} {forbidden}")

# 举报去重与自动待审
code, report1 = call(
    "POST", f"/posts/{public_post['id']}/report", token=reporters[0]["token"],
    body={"reason": "辱骂攻击", "block_author": False}, expect=201,
)
check("举报返回受理编号", report1["ticket_no"].startswith("DC-"), report1["ticket_no"])

code, again = call("POST", f"/posts/{public_post['id']}/report", token=reporters[0]["token"], body={"reason": "辱骂攻击", "block_author": False})
check("重复举报被拒绝", code == 409, f"{code} {again}")

code, self_report = call("POST", f"/posts/{public_post['id']}/report", token=author_pub["token"], body={"reason": "其他"})
check("不能举报自己", code == 400, self_report)

for reporter in reporters[1:]:
    call("POST", f"/posts/{public_post['id']}/report", token=reporter["token"], body={"reason": "广告引流", "block_author": False}, expect=201)

code, pending = call("GET", f"/posts/{public_post['id']}", token=author_pub["token"], expect=200)
check("5 人举报后自动进入待审", pending["status"] == "pending", pending["status"])

code, feed = call("GET", "/posts", expect=200)
check("待审内容从公开时间线消失", public_post["id"] not in {item["id"] for item in feed["items"]}, feed["total"])

code, mine = call("GET", "/posts/me", token=author_pub["token"], expect=200)
statuses = {item["id"]: item["display_status"] for item in mine["items"]}
check("作者看到审核中徽标", statuses.get(public_post["id"]) == "审核中", statuses)

code, _ = call("GET", f"/posts/{public_post['id']}", token=viewer["token"])
check("待审内容他人访问 404", code == 404, code)

code, history = call("GET", f"/posts/{public_post['id']}/status-history", token=author_pub["token"], expect=200)
check(
    "状态历史留痕（新建 + 待审）",
    len(history) >= 2 and history[-1]["to_status"] == "pending",
    history,
)

code, my_reports = call("GET", "/reports/me", token=reporters[0]["token"], expect=200)
check("我的举报可查看", len(my_reports) == 1 and my_reports[0]["ticket_no"] == report1["ticket_no"], my_reports)

# 管理端
staff_username = os.environ.get("STAFF_USERNAME", "")
staff_password = os.environ.get("STAFF_PASSWORD", "")

if not staff_username or not staff_password:
    env_path = os.path.join(REPO_ROOT, ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("STAFF_USERNAME=") and not staff_username:
                    staff_username = line.split("=", 1)[1].strip()
                elif line.startswith("STAFF_PASSWORD=") and not staff_password:
                    staff_password = line.split("=", 1)[1].strip()

if not staff_username:
    staff_username = "moderator"

code, staff_token = call("POST", "/staff/login", body={"username": staff_username, "password": staff_password}, expect=200)
staff_headers = staff_token["access_token"]

code, queue = call("GET", "/staff/reports", token=staff_headers, expect=200)
aggregated = [item for item in queue if item["target_id"] == public_post["id"]]
check(
    "管理端举报按对象聚合",
    len(aggregated) == 1 and aggregated[0]["report_count"] == 5 and aggregated[0]["reporter_count"] == 5,
    queue,
)

report_listing = call("GET", f"/staff/reports", token=staff_headers, expect=200)[1]
first_report_id = None
for item in aggregated:
    pass
code, reports_all = call("GET", "/reports/me", token=reporters[0]["token"], expect=200)
first_report_id = reports_all[0]["id"]

code, restored = call("PATCH", f"/staff/reports/{first_report_id}", token=staff_headers, body={"action": "restore", "note": "误报，恢复"})
check("管理端恢复后回到 normal", code == 200 and restored["post_status"] == "normal", restored)

code, feed = call("GET", "/posts", expect=200)
check("恢复后重新出现在公开时间线", public_post["id"] in {item["id"] for item in feed["items"]}, feed["total"])

code, history = call("GET", f"/posts/{public_post['id']}/status-history", token=staff_headers, expect=200)
check("管理端可读状态历史", len(history) >= 3 and history[-1]["to_status"] == "normal", history)

# 拉黑（双向隔离 + 幂等）
code, block1 = call("POST", f"/users/{author_pub['username']}/block", token=viewer["token"], expect=200)
check("拉黑成功", block1["blocked"] is True and block1["created"] is True, block1)

code, feed_viewer = call("GET", "/posts", token=viewer["token"], expect=200)
check("拉黑后看不到对方内容", public_post["id"] not in {item["id"] for item in feed_viewer["items"]}, feed_viewer["total"])

code, _ = call("GET", f"/posts/{public_post['id']}", token=viewer["token"])
check("拉黑后详情 404", code == 404, code)

code, block_again = call("POST", f"/users/{author_pub['username']}/block", token=viewer["token"], expect=200)
check("重复拉黑幂等", block_again["created"] is False, block_again)

code, blocks = call("GET", "/blocks/me", token=viewer["token"], expect=200)
check("已拉黑列表正确", [b["username"] for b in blocks] == [author_pub["username"]], blocks)

code, unblock1 = call("DELETE", f"/users/{author_pub['username']}/block", token=viewer["token"], expect=200)
check("解除拉黑成功", unblock1["removed"] is True, unblock1)

code, feed_viewer = call("GET", "/posts", token=viewer["token"], expect=200)
check("解除后恢复可见", public_post["id"] in {item["id"] for item in feed_viewer["items"]}, feed_viewer["total"])

annotation = None

print("\nSUMMARY", json.dumps({
    "total": len(results),
    "passed": sum(1 for _, ok, _ in results if ok),
    "failed": [name for name, ok, _ in results if not ok],
    "users": created_users,
    "posts": created_posts,
}, ensure_ascii=False))

if any(not ok for _, ok, _ in results):
    raise SystemExit(1)
