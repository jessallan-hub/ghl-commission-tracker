from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "https://services.leadconnectorhq.com"
DEFAULT_API_VERSION = "2021-07-28"


class GhlApiError(RuntimeError):
    def __init__(self, method: str, path: str, status: int, body: Any):
        super().__init__(f"GHL API {method} {path} failed with status {status}")
        self.method = method
        self.path = path
        self.status = status
        self.body = body


@dataclass(frozen=True)
class GhlAccount:
    key: str
    name: str
    location_id: str
    api_key: str
    base_url: str = DEFAULT_BASE_URL
    api_version: str = DEFAULT_API_VERSION

    def redacted(self) -> dict[str, str]:
        return {
            "key": self.key,
            "name": self.name,
            "location_id": self.location_id,
            "base_url": self.base_url,
            "api_version": self.api_version,
            "token": redact_token(self.api_key),
        }


class GhlClient:
    def __init__(self, account: GhlAccount, timeout: int = 30):
        self.account = account
        self.timeout = timeout

    def get(
        self,
        path: str,
        query: dict[str, Any] | None = None,
        *,
        location_key: str = "locationId",
    ) -> Any:
        query = dict(query or {})
        query.setdefault(location_key, self.account.location_id)
        return self.request("GET", path, query=query)

    def request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        body: Any | None = None,
    ) -> Any:
        url = build_url(self.account.base_url, path, query)
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Codex-GHL-Audit/1.0",
            "Version": self.account.api_version,
            "Authorization": f"Bearer {self.account.api_key}",
        }
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        started = time.time()

        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                response_body = read_body(response.read())
                return {
                    "ok": True,
                    "status": response.status,
                    "duration_ms": int((time.time() - started) * 1000),
                    "data": response_body,
                }
        except urllib.error.HTTPError as error:
            response_body = read_body(error.read())
            raise GhlApiError(method, path, error.code, response_body) from error


def build_url(base_url: str, path: str, query: dict[str, Any] | None) -> str:
    url = urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    params = {
        key: str(value)
        for key, value in (query or {}).items()
        if value is not None
    }

    if params:
        return f"{url}?{urllib.parse.urlencode(params)}"

    return url


def read_body(raw: bytes) -> Any:
    if not raw:
        return None

    text = raw.decode("utf-8", errors="replace")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def load_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}

    if not path.exists():
        return values

    for line in path.read_text().splitlines():
        stripped = line.strip()

        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")

    return values


def load_env(root: Path) -> dict[str, str]:
    values = load_dotenv(root / ".env.local")
    merged = dict(os.environ)
    merged.update(values)
    return merged


def load_accounts(root: Path) -> list[GhlAccount]:
    env = load_env(root)
    base_url = env.get("GHL_API_BASE_URL", DEFAULT_BASE_URL)
    api_version = env.get("GHL_API_VERSION", DEFAULT_API_VERSION)
    accounts: list[GhlAccount] = []

    if env.get("GHL_API_KEY") and env.get("GHL_LOCATION_ID"):
        accounts.append(
            GhlAccount(
                key="rt-digital",
                name="RT Digital",
                location_id=env["GHL_LOCATION_ID"],
                api_key=env["GHL_API_KEY"],
                base_url=base_url,
                api_version=api_version,
            )
        )

    if env.get("GHL_DOCTOR_DAMP_API_KEY") and env.get("GHL_DOCTOR_DAMP_LOCATION_ID"):
        accounts.append(
            GhlAccount(
                key="doctor-damp",
                name="Doctor Damp",
                location_id=env["GHL_DOCTOR_DAMP_LOCATION_ID"],
                api_key=env["GHL_DOCTOR_DAMP_API_KEY"],
                base_url=base_url,
                api_version=api_version,
            )
        )

    config_path = root / "scripts" / "ghl" / "accounts.json"

    if config_path.exists():
        config = json.loads(config_path.read_text())

        for item in config.get("accounts", []):
            token_env = item.get("api_key_env")
            location_env = item.get("location_id_env")
            token = env.get(token_env, "") if token_env else item.get("api_key", "")
            location_id = (
                env.get(location_env, "") if location_env else item.get("location_id", "")
            )

            if token and location_id:
                accounts.append(
                    GhlAccount(
                        key=item["key"],
                        name=item.get("name", item["key"]),
                        location_id=location_id,
                        api_key=token,
                        base_url=item.get("base_url", base_url),
                        api_version=item.get("api_version", api_version),
                    )
                )

    return accounts


def redact_token(token: str) -> str:
    if len(token) <= 12:
        return "***"

    return f"{token[:7]}...{token[-4:]}"


def get_account(root: Path, key: str) -> GhlAccount:
    accounts = load_accounts(root)

    for account in accounts:
        if account.key == key:
            return account

    available = ", ".join(account.key for account in accounts) or "none"
    raise SystemExit(f"Unknown account '{key}'. Available: {available}")


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]
