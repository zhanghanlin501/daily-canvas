#!/usr/bin/env python3
"""Keep the public tunnel alive and sync runtime config to Gitee."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable
from urllib.error import URLError
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parent.parent
RUNTIME_CONFIG_PATH = Path("deploy/runtime-config.json")
RUNTIME_CONFIG_BRANCH = os.getenv("RUNTIME_CONFIG_BRANCH", "runtime-config")
TUNNEL_SERVICE_NAME = os.getenv("TUNNEL_SERVICE_NAME", "tunnel")
STACK_SERVICES = ("db", "backend", "frontend", TUNNEL_SERVICE_NAME)
PUBLIC_URL_PATTERN = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


def log(message: str) -> None:
    print(f"[tunnel-guard] {message}", flush=True)


def run_command(
    command: Iterable[str],
    *,
    cwd: Path = REPO_ROOT,
    check: bool = True,
    capture_output: bool = True,
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        list(command),
        cwd=cwd,
        check=False,
        text=True,
        capture_output=capture_output,
    )

    if check and result.returncode != 0:
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()
        details = "\n".join(part for part in (stdout, stderr) if part)
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(command)}"
            + (f"\n{details}" if details else "")
        )

    return result


def ensure_stack_running() -> None:
    log("Ensuring local Docker stack is running")
    run_command(["docker", "compose", "up", "-d", *STACK_SERVICES], capture_output=True)


def restart_tunnel() -> None:
    log("Restarting public tunnel service")
    run_command(["docker", "compose", "stop", TUNNEL_SERVICE_NAME], check=False)
    run_command(["docker", "compose", "rm", "-f", TUNNEL_SERVICE_NAME], check=False)
    run_command(["docker", "compose", "up", "-d", TUNNEL_SERVICE_NAME], capture_output=True)


def extract_tunnel_url(timeout_seconds: int = 90) -> str | None:
    deadline = time.time() + timeout_seconds

    while time.time() < deadline:
        logs = run_command(
            ["docker", "compose", "logs", "--no-color", TUNNEL_SERVICE_NAME],
            capture_output=True,
        ).stdout
        matches = PUBLIC_URL_PATTERN.findall(logs)
        if matches:
            return matches[-1]
        time.sleep(2)

    return None


def fetch_json(url: str, timeout_seconds: int = 10) -> dict:
    request = Request(url, headers={"User-Agent": "daily-canvas-tunnel-guard"})
    with urlopen(request, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def is_public_url_available(public_base_url: str) -> bool:
    try:
        with urlopen(
            Request(public_base_url, headers={"User-Agent": "daily-canvas-tunnel-guard"}),
            timeout=10,
        ) as response:
            html = response.read().decode("utf-8", errors="ignore")
            if response.status != 200 or "<html" not in html.lower():
                return False

        health_payload = fetch_json(f"{public_base_url}/api/health")
        return health_payload.get("status") == "healthy"
    except (OSError, URLError, json.JSONDecodeError):
        return False


def wait_for_public_url(
    public_base_url: str,
    timeout_seconds: int = 90,
    interval_seconds: int = 5,
) -> bool:
    """Allow a newly issued Quick Tunnel time for DNS and edge routing to settle."""
    deadline = time.time() + timeout_seconds

    while time.time() < deadline:
        if is_public_url_available(public_base_url):
            return True
        time.sleep(interval_seconds)

    return False


def resolve_remote_url() -> str:
    return run_command(
        ["git", "config", "--get", "remote.origin.url"],
        capture_output=True,
    ).stdout.strip()


def resolve_git_identity(key: str, fallback: str) -> str:
    result = run_command(["git", "config", "--get", key], check=False)
    value = result.stdout.strip()
    return value or fallback


def sync_runtime_config_to_gitee(public_base_url: str) -> None:
    payload = {
        "publicBaseUrl": public_base_url,
        "apiBaseUrl": f"{public_base_url}/api",
        "healthUrl": f"{public_base_url}/api/health",
        "source": "cloudflare-quick-tunnel",
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    remote_url = resolve_remote_url()
    author_name = resolve_git_identity("user.name", "Daily Canvas Bot")
    author_email = resolve_git_identity("user.email", "daily-canvas-bot@example.com")

    with tempfile.TemporaryDirectory(prefix="daily-canvas-runtime-config-") as temp_dir:
        temp_path = Path(temp_dir)
        clone_branch_result = run_command(
            [
                "git",
                "clone",
                "--depth",
                "1",
                "--branch",
                RUNTIME_CONFIG_BRANCH,
                remote_url,
                temp_dir,
            ],
            check=False,
        )

        if clone_branch_result.returncode != 0:
            if temp_path.exists():
                shutil.rmtree(temp_path)
            run_command(["git", "clone", "--depth", "1", remote_url, temp_dir])
            run_command(["git", "checkout", "-B", RUNTIME_CONFIG_BRANCH], cwd=temp_path)

        run_command(["git", "config", "--local", "user.name", author_name], cwd=temp_path)
        run_command(["git", "config", "--local", "user.email", author_email], cwd=temp_path)

        output_path = temp_path / RUNTIME_CONFIG_PATH
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        run_command(["git", "add", str(RUNTIME_CONFIG_PATH)], cwd=temp_path)

        diff_result = run_command(
            ["git", "diff", "--cached", "--quiet"],
            cwd=temp_path,
            check=False,
        )
        if diff_result.returncode == 0:
            log("Runtime config already up to date on Gitee")
            return

        run_command(
            ["git", "commit", "-m", "chore: update public runtime config"],
            cwd=temp_path,
        )
        run_command(
            ["git", "push", "origin", f"HEAD:{RUNTIME_CONFIG_BRANCH}"],
            cwd=temp_path,
        )
        log(f"Synced runtime config to Gitee branch {RUNTIME_CONFIG_BRANCH}")


def keep_tunnel_healthy(max_runtime_minutes: int) -> str:
    deadline = datetime.now(timezone.utc) + timedelta(minutes=max_runtime_minutes)
    attempt = 0

    while datetime.now(timezone.utc) < deadline:
        attempt += 1
        log(f"Tunnel validation attempt {attempt}")

        ensure_stack_running()
        public_base_url = extract_tunnel_url()
        if public_base_url and wait_for_public_url(public_base_url):
            log(f"Tunnel is healthy: {public_base_url}")
            sync_runtime_config_to_gitee(public_base_url)
            return public_base_url

        log("Current tunnel is unavailable, generating a new one")
        restart_tunnel()
        public_base_url = extract_tunnel_url()

        if public_base_url and wait_for_public_url(public_base_url):
            log(f"Regenerated healthy tunnel: {public_base_url}")
            sync_runtime_config_to_gitee(public_base_url)
            return public_base_url

        time.sleep(5)

    raise RuntimeError(
        f"Unable to produce a healthy tunnel within {max_runtime_minutes} minutes"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ensure the public tunnel is healthy and publish its address to Gitee.",
    )
    parser.add_argument(
        "--max-runtime-minutes",
        type=int,
        default=50,
        help="Maximum minutes to keep retrying until a healthy tunnel is produced.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        public_base_url = keep_tunnel_healthy(args.max_runtime_minutes)
    except Exception as exc:  # noqa: BLE001
        log(str(exc))
        return 1

    log(f"Done. Active public base URL: {public_base_url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
