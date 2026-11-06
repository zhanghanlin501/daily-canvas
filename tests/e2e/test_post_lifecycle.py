"""创作生命周期端到端回归：24 小时编辑、软删除、回收站与管理端边界。

运行方式见 `tests/run-e2e-tests.sh`（会创建临时账号，跑完由脚本清理）。
可用环境变量覆盖：`DC_API_BASE`、`DC_COMPOSE_CMD`、`STAFF_USERNAME`、`STAFF_PASSWORD`。
"""

import json
import os
import shlex
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta

BASE = os.environ.get("DC_API_BASE", "http://localhost:8080/api")
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
COMPOSE_CMD = shlex.split(os.environ.get("DC_COMPOSE_CMD", "docker compose"))

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


def run_psql(sql):
    result = subprocess.run(
        [
            *COMPOSE_CMD,
            "exec",
            "-T",
            "db",
            "psql",
            "-U",
            "postgres",
            "-d",
            "daily_canvas",
            "-v",
            "ON_ERROR_STOP=1",
            "-q",
            "-c",
            sql,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise AssertionError(f"psql 执行失败：{result.stderr or result.stdout}")


tag = uuid.uuid4().hex[:6]


def make_user(prefix):
    username = f"{prefix}_{tag}"
    email = f"{username}@example.com"
    code, payload = call(
        "POST",
        "/auth/register",
        body={"username": username, "email": email, "password": "Passw0rd!"},
        expect=201,
    )
    created_users.append(payload["id"])
    _, token_payload = call(
        "POST",
        "/auth/login",
        form={"username": email, "password": "Passw0rd!"},
        expect=200,
    )
    return {
        "id": payload["id"],
        "username": username,
        "email": email,
        "token": token_payload["access_token"],
    }


def create_post(author, suffix):
    code, post = call(
        "POST",
        "/posts",
        token=author["token"],
        body={"content": f"生命周期-{suffix}-{tag}", "visibility": "public"},
        expect=201,
    )
    created_posts.append(post["id"])
    return post


def load_staff_credentials():
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

    return staff_username, staff_password


def staff_token():
    staff_username, staff_password = load_staff_credentials()
    _, payload = call(
        "POST",
        "/staff/login",
        body={"username": staff_username, "password": staff_password},
        expect=200,
    )
    return payload["access_token"]


viewer = make_user("viewer_life")

# ---------------------------------------------------------------- 编辑窗口
mood_payload = call("GET", "/moods", expect=200)[1]
mood_name = mood_payload[0]["name"] if mood_payload else None

edit_author = make_user("pub_lifeedit")
edit_post = create_post(edit_author, "edit")

edit_body = {"content": f"已编辑内容-{tag}"}
if mood_name:
    edit_body["mood"] = mood_name
code, edited = call("PATCH", f"/posts/{edit_post['id']}", token=edit_author["token"], body=edit_body)
check(
    "24 小时内可编辑内容并写入 edited_at",
    code == 200
    and edited["content"] == edit_body["content"]
    and edited.get("edited_at")
    and edited.get("can_edit_content") is True,
    edited,
)

code, empty_update = call(
    "PATCH", f"/posts/{edit_post['id']}", token=edit_author["token"], body={}
)
check("没有可修改字段返回 400", code == 400, f"{code} {empty_update}")

code, invalid_mood = call(
    "PATCH",
    f"/posts/{edit_post['id']}",
    token=edit_author["token"],
    body={"mood": "不存在的情绪标签"},
)
check(
    "非法情绪优先返回 400",
    code == 400 and "情绪" in json.dumps(invalid_mood, ensure_ascii=False),
    f"{code} {invalid_mood}",
)

code, forbidden = call(
    "PATCH", f"/posts/{edit_post['id']}", token=viewer["token"], body={"content": "越权编辑"}
)
check("非作者编辑返回 403", code == 403, f"{code} {forbidden}")

code, forbidden_delete = call("DELETE", f"/posts/{edit_post['id']}", token=viewer["token"])
check("非作者删除返回 403", code == 403, f"{code} {forbidden_delete}")

# ---------------------------------------------------------------- 草稿日期与补写窗口
today = (datetime.utcnow() + timedelta(hours=8)).date()
backfill_author = make_user("pub_lifebackfill")
backfill_date = (today - timedelta(days=2)).isoformat()

code, backfilled = call(
    "POST",
    "/posts",
    token=backfill_author["token"],
    body={"content": f"补写两日前-{tag}", "post_date": backfill_date, "visibility": "public"},
    expect=201,
)
check(
    "可补写 2 天前的日期并写入 post_date",
    backfilled["post_date"] == backfill_date,
    backfilled,
)

code, three_days_ago = call(
    "POST",
    "/posts",
    token=backfill_author["token"],
    body={
        "content": f"补写三日前-{tag}",
        "post_date": (today - timedelta(days=3)).isoformat(),
    },
    expect=201,
)
check("可补写 3 天前的日期", three_days_ago["post_date"] == (today - timedelta(days=3)).isoformat())

code, duplicate_backfill = call(
    "POST",
    "/posts",
    token=backfill_author["token"],
    body={"content": "同一天再写一条", "post_date": backfill_date},
)
check("补写日期已有创作时返回 409", code == 409, f"{code} {duplicate_backfill}")

code, future_backfill = call(
    "POST",
    "/posts",
    token=backfill_author["token"],
    body={"content": "未来日期", "post_date": (today + timedelta(days=1)).isoformat()},
)
check("未来日期发布返回 400", code == 400, f"{code} {future_backfill}")

code, too_old_backfill = call(
    "POST",
    "/posts",
    token=backfill_author["token"],
    body={"content": "四天前", "post_date": (today - timedelta(days=4)).isoformat()},
)
check(
    "第 4 天前补写返回 400 并说明窗口",
    code == 400 and "3 天" in json.dumps(too_old_backfill, ensure_ascii=False),
    f"{code} {too_old_backfill}",
)

code, backfill_lookup = call(
    "GET", f"/posts/date/{backfill_date}", token=backfill_author["token"], expect=200
)
check(
    "按日期查询能看到补写内容",
    backfill_lookup["id"] == backfilled["id"] and backfill_lookup["post_date"] == backfill_date,
    backfill_lookup,
)

code, empty_lookup = call(
    "GET",
    f"/posts/date/{(today - timedelta(days=1)).isoformat()}",
    token=backfill_author["token"],
)
check("没有创作的日期查询返回 404", code == 404, f"{code} {empty_lookup}")

code, backfill_edit = call(
    "PATCH",
    f"/posts/{backfilled['id']}",
    token=backfill_author["token"],
    body={"content": f"补写两日前-已编辑-{tag}"},
)
check(
    "补写内容按实际发布时间计算 24 小时编辑窗口",
    code == 200 and backfill_edit.get("edited_at"),
    backfill_edit,
)

# ---------------------------------------------------------------- 24 小时窗口过期
expired_author = make_user("pub_lifeexpired")
expired_post = create_post(expired_author, "expired")
run_psql(
    "UPDATE daily_posts SET created_at = now() - interval '2 days' "
    f"WHERE id = {expired_post['id']};"
)

code, expired_edit = call(
    "PATCH",
    f"/posts/{expired_post['id']}",
    token=expired_author["token"],
    body={"content": "过期后还想改"},
)
check(
    "超过 24 小时编辑返回 409 并提示仍可改可见性",
    code == 409 and "可见性" in json.dumps(expired_edit, ensure_ascii=False),
    f"{code} {expired_edit}",
)

code, visibility = call(
    "PATCH",
    f"/posts/{expired_post['id']}/visibility",
    token=expired_author["token"],
    body={"visibility": "private"},
)
check("编辑窗口过期不影响可见性切换", code == 200 and visibility["visibility"] == "private", visibility)

# ---------------------------------------------------------------- 删除 / 回收站 / 恢复
delete_author = make_user("pub_lifedel")
delete_post = create_post(delete_author, "delete")

code, _ = call("DELETE", f"/posts/{delete_post['id']}", token=delete_author["token"], expect=204)
check("作者删除返回 204", code == 204)

code, _ = call("DELETE", f"/posts/{delete_post['id']}", token=delete_author["token"], expect=204)
check("重复删除保持幂等", code == 204)

code, deleted_detail = call(
    "GET", f"/posts/{delete_post['id']}", token=delete_author["token"], expect=200
)
check(
    "删除后作者详情仍可见并带 deleted_by_author",
    deleted_detail["status"] == "deleted" and deleted_detail["deleted_by_author"] is True,
    deleted_detail,
)

code, feed = call("GET", "/posts", expect=200)
check("删除后从公开时间线消失", delete_post["id"] not in {item["id"] for item in feed["items"]})

code, mine = call("GET", "/posts/me", token=delete_author["token"], expect=200)
check("删除后从我的创作列表消失", delete_post["id"] not in {item["id"] for item in mine["items"]})

code, trash = call("GET", "/posts/trash", token=delete_author["token"], expect=200)
check(
    "删除后进入作者回收站",
    any(item["id"] == delete_post["id"] for item in trash["items"]),
    trash,
)

code, today = call("GET", "/posts/today", token=delete_author["token"], expect=200)
check("删除后今天仍占用发布名额", today["id"] == delete_post["id"] and today["status"] == "deleted", today)

code, duplicate = call(
    "POST", "/posts", token=delete_author["token"], body={"content": "删除后当天再发一条"}
)
check("删除不释放当天名额（再次发布 409）", code == 409, f"{code} {duplicate}")

code, restored = call(
    "POST", f"/posts/{delete_post['id']}/restore", token=delete_author["token"], expect=200
)
check(
    "30 天内恢复成功且清空删除标记",
    restored["status"] == "normal"
    and restored["deleted_at"] is None
    and restored["deleted_by_author"] is False,
    restored,
)

code, feed = call("GET", "/posts", expect=200)
check("恢复后重新出现在公开时间线", delete_post["id"] in {item["id"] for item in feed["items"]})

code, trash = call("GET", "/posts/trash", token=delete_author["token"], expect=200)
check("恢复后离开回收站", delete_post["id"] not in {item["id"] for item in trash["items"]})

code, restore_again = call(
    "POST", f"/posts/{delete_post['id']}/restore", token=delete_author["token"]
)
check("未删除内容不可重复恢复", code == 409, f"{code} {restore_again}")

# ---------------------------------------------------------------- 30 天恢复边界
expired_restore_author = make_user("pub_liferestore")
expired_restore_post = create_post(expired_restore_author, "restore-expired")
call("DELETE", f"/posts/{expired_restore_post['id']}", token=expired_restore_author["token"], expect=204)
run_psql(
    "UPDATE daily_posts SET deleted_at = now() - interval '31 days' "
    f"WHERE id = {expired_restore_post['id']};"
)
code, expired_restore = call(
    "POST",
    f"/posts/{expired_restore_post['id']}/restore",
    token=expired_restore_author["token"],
)
check("超过 30 天恢复返回 409", code == 409, f"{code} {expired_restore}")

code, other_restore = call(
    "POST", f"/posts/{expired_restore_post['id']}/restore", token=viewer["token"]
)
check("非作者恢复返回 404", code == 404, f"{code} {other_restore}")

# ---------------------------------------------------------------- 管理端状态与作者删除的边界
staff = staff_token()

hidden_author = make_user("pub_lifehidden")
hidden_post = create_post(hidden_author, "hidden")
call(
    "PATCH",
    f"/staff/posts/{hidden_post['id']}/status",
    token=staff,
    body={"status": "hidden", "reason": "回归：先隐藏"},
    expect=200,
)
call("DELETE", f"/posts/{hidden_post['id']}", token=hidden_author["token"], expect=204)
code, hidden_restored = call(
    "POST", f"/posts/{hidden_post['id']}/restore", token=hidden_author["token"], expect=200
)
check(
    "管理端隐藏后作者删除再恢复，仍保持 hidden",
    hidden_restored["status"] == "hidden" and hidden_restored["visibility"] == "public",
    hidden_restored,
)

code, feed = call("GET", "/posts", expect=200)
check(
    "恢复为 hidden 的内容不会重新进入公开时间线",
    hidden_post["id"] not in {item["id"] for item in feed["items"]},
)

staff_deleted_author = make_user("pub_lifestaffdel")
staff_deleted_post = create_post(staff_deleted_author, "staff-delete")
call(
    "PATCH",
    f"/staff/posts/{staff_deleted_post['id']}/status",
    token=staff,
    body={"status": "deleted", "reason": "回归：管理端强制删除"},
    expect=200,
)

code, staff_deleted_detail = call(
    "GET", f"/posts/{staff_deleted_post['id']}", token=staff_deleted_author["token"], expect=200
)
check(
    "管理端强制删除后 deleted_by_author 为 false",
    staff_deleted_detail["status"] == "deleted"
    and staff_deleted_detail["deleted_by_author"] is False,
    staff_deleted_detail,
)

code, staff_deleted_trash = call(
    "GET", "/posts/trash", token=staff_deleted_author["token"], expect=200
)
check(
    "管理端强制删除的内容不进入作者回收站",
    staff_deleted_post["id"] not in {item["id"] for item in staff_deleted_trash["items"]},
    staff_deleted_trash,
)

code, staff_deleted_restore = call(
    "POST",
    f"/posts/{staff_deleted_post['id']}/restore",
    token=staff_deleted_author["token"],
)
check("作者不能恢复管理端强制删除的内容", code == 404, f"{code} {staff_deleted_restore}")

print(
    "\nSUMMARY",
    json.dumps(
        {
            "total": len(results),
            "passed": sum(1 for _, ok, _ in results if ok),
            "failed": [name for name, ok, _ in results if not ok],
            "users": created_users,
            "posts": created_posts,
        },
        ensure_ascii=False,
    ),
)

if any(not ok for _, ok, _ in results):
    raise SystemExit(1)
