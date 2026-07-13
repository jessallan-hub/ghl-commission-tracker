from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ghl_client import GhlApiError, GhlClient, get_account, load_accounts, project_root


REPORT_DIR = "reports/ghl"
DEFAULT_LIMIT = 100


def main() -> None:
    root = project_root()
    parser = argparse.ArgumentParser(description="Read-only HighLevel audit tools")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("accounts", help="List configured accounts")

    audit_parser = subparsers.add_parser("audit", help="Run read-only account audit")
    audit_parser.add_argument("--account", help="Account key, e.g. doctor-damp")
    audit_parser.add_argument("--all", action="store_true", help="Audit all accounts")
    audit_parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    audit_parser.add_argument("--out", default=REPORT_DIR)

    workflows_parser = subparsers.add_parser(
        "workflows",
        help="Probe likely workflow endpoints and save whatever the token can read",
    )
    workflows_parser.add_argument("--account", required=True)
    workflows_parser.add_argument("--out", default=REPORT_DIR)

    args = parser.parse_args()

    if args.command == "accounts":
        print_json([account.redacted() for account in load_accounts(root)])
        return

    if args.command == "audit":
        accounts = load_accounts(root) if args.all else [get_account(root, args.account)]
        reports = [audit_account(root, account.key, args.limit, Path(args.out)) for account in accounts]
        print_json(reports)
        return

    if args.command == "workflows":
        report = probe_workflows(root, args.account, Path(args.out))
        print_json(report)
        return


def audit_account(root: Path, account_key: str, limit: int, out_dir: Path) -> dict[str, Any]:
    account = get_account(root, account_key)
    client = GhlClient(account)
    timestamp = utc_now()
    report: dict[str, Any] = {
        "account": account.redacted(),
        "generated_at": timestamp,
        "limits": {"contacts": limit, "conversations": limit, "opportunities": limit},
        "checks": {},
    }

    contacts = safe_get(client, "/contacts/", {"limit": limit})
    conversations = safe_get(client, "/conversations/search", {"limit": limit})
    opportunities = safe_get(
        client,
        "/opportunities/search",
        {"limit": limit},
        location_key="location_id",
    )
    pipelines = safe_get(client, "/opportunities/pipelines", {})
    calendars = safe_get(client, "/calendars/", {})

    report["checks"]["contacts"] = summarize_contacts(contacts)
    report["checks"]["conversations"] = summarize_conversations(conversations)
    report["checks"]["opportunities"] = summarize_opportunities(opportunities)
    report["checks"]["pipelines"] = summarize_pipelines(pipelines)
    report["checks"]["calendars"] = summarize_calendars(calendars)
    report["checks"]["ai_agent_signals"] = infer_ai_agent_signals(conversations)
    report["checks"]["lead_flow"] = summarize_lead_flow(contacts, conversations)

    path = write_report(root, out_dir, f"{account.key}-audit", report)
    report["report_path"] = str(path)
    return compact_report(report)


def probe_workflows(root: Path, account_key: str, out_dir: Path) -> dict[str, Any]:
    account = get_account(root, account_key)
    client = GhlClient(account)
    candidate_paths = [
        ("/workflows/", "locationId", {}),
        ("/workflows/search", "locationId", {"limit": 100}),
        ("/workflows", "locationId", {"limit": 100}),
        ("/locations/{locationId}/workflows", None, {"limit": 100}),
        ("/automation/workflows", "locationId", {"limit": 100}),
    ]
    results = []

    for path, location_key, query in candidate_paths:
        actual_path = path.replace("{locationId}", account.location_id)

        try:
            if location_key:
                response = client.get(actual_path, query, location_key=location_key)
            else:
                response = client.request("GET", actual_path, query=query)

            results.append(
                {
                    "path": actual_path,
                    "ok": True,
                    "status": response["status"],
                    "summary": summarize_unknown_collection(response["data"]),
                }
            )
        except GhlApiError as error:
            results.append(
                {
                    "path": actual_path,
                    "ok": False,
                    "status": error.status,
                    "message": extract_message(error.body),
                }
            )

    report = {
        "account": account.redacted(),
        "generated_at": utc_now(),
        "note": "Endpoint probe only. If no endpoint works, workflow mapping may need an export, a different scope, or browser/UI automation.",
        "results": results,
    }
    path = write_report(root, out_dir, f"{account.key}-workflow-probe", report)
    return {"account": account.key, "report_path": str(path), "results": results}


def safe_get(
    client: GhlClient,
    path: str,
    query: dict[str, Any],
    *,
    location_key: str = "locationId",
) -> dict[str, Any]:
    try:
        return client.get(path, query, location_key=location_key)
    except GhlApiError as error:
        return {
            "ok": False,
            "status": error.status,
            "message": extract_message(error.body),
            "data": error.body,
        }


def summarize_contacts(response: dict[str, Any]) -> dict[str, Any]:
    records = records_from(response, "contacts")
    tags = Counter(tag for row in records for tag in row.get("tags", []) if isinstance(tag, str))
    sources = Counter((row.get("source") or "Unknown source") for row in records)

    return {
        "ok": response.get("ok", False),
        "status": response.get("status"),
        "total_reported": nested_get(response, ["data", "meta", "total"]),
        "sample_count": len(records),
        "top_sources": counter_items(sources, 10),
        "top_tags": counter_items(tags, 15),
        "newest_contact_at": first_value(records, ["dateAdded", "createdAt"]),
    }


def summarize_conversations(response: dict[str, Any]) -> dict[str, Any]:
    records = records_from(response, "conversations")
    channels = Counter((row.get("type") or row.get("lastMessageType") or "Unknown") for row in records)
    unread = sum(int(row.get("unreadCount") or 0) for row in records)

    return {
        "ok": response.get("ok", False),
        "status": response.get("status"),
        "total_reported": nested_get(response, ["data", "total"]),
        "sample_count": len(records),
        "unread_count": unread,
        "channels": counter_items(channels, 10),
        "newest_message_at": first_value(records, ["lastMessageDate", "lastMessageAt", "dateUpdated"]),
    }


def summarize_opportunities(response: dict[str, Any]) -> dict[str, Any]:
    records = records_from(response, "opportunities")
    statuses = Counter((row.get("status") or "Unknown") for row in records)
    total_value = sum(float(row.get("monetaryValue") or row.get("value") or 0) for row in records)

    return {
        "ok": response.get("ok", False),
        "status": response.get("status"),
        "sample_count": len(records),
        "statuses": counter_items(statuses, 10),
        "sample_value": total_value,
    }


def summarize_pipelines(response: dict[str, Any]) -> dict[str, Any]:
    records = records_from(response, "pipelines")
    stage_count = sum(len(row.get("stages") or []) for row in records)

    return {
        "ok": response.get("ok", False),
        "status": response.get("status"),
        "pipeline_count": len(records),
        "stage_count": stage_count,
        "pipeline_names": [row.get("name") for row in records[:10]],
    }


def summarize_calendars(response: dict[str, Any]) -> dict[str, Any]:
    records = records_from(response, "calendars")

    return {
        "ok": response.get("ok", False),
        "status": response.get("status"),
        "calendar_count": len(records),
        "active_count": sum(1 for row in records if row.get("isActive") is not False),
        "calendar_names": [row.get("name") for row in records[:10]],
    }


def infer_ai_agent_signals(response: dict[str, Any]) -> dict[str, Any]:
    records = records_from(response, "conversations")
    text_rows = [
        " ".join(str(row.get(key) or "") for key in ["lastMessageBody", "lastOutboundMessageAction", "lastMessageType"])
        for row in records
    ]
    lowered = [text.lower() for text in text_rows]

    return {
        "sample_count": len(records),
        "automation_like": count_matching(lowered, ["workflow", "bot", "automated", "ai"]),
        "booking_language": count_matching(lowered, ["book", "appointment", "calendar", "meeting"]),
        "stop_or_handoff_language": count_matching(lowered, ["stop", "unsubscribe", "human", "handoff"]),
        "reply_language": count_matching(lowered, ["replied", "reply", "responded"]),
        "note": "Heuristic only. Stronger AI-agent checks need message history, workflow metadata, or the AI agent endpoint/export.",
    }


def summarize_lead_flow(
    contacts_response: dict[str, Any],
    conversations_response: dict[str, Any],
) -> dict[str, Any]:
    contacts = records_from(contacts_response, "contacts")
    conversations = records_from(conversations_response, "conversations")
    contacts_with_conversation = {
        row.get("contactId")
        for row in conversations
        if row.get("contactId")
    }
    by_source: dict[str, dict[str, Any]] = {}

    for contact in contacts:
        source = contact.get("source") or "Unknown source"
        tags = " ".join(str(tag) for tag in (contact.get("tags") or [])).lower()
        row = by_source.setdefault(
            source,
            {"source": source, "leads": 0, "with_conversation": 0, "booked": 0, "needs_review": 0},
        )
        row["leads"] += 1
        row["with_conversation"] += 1 if contact.get("id") in contacts_with_conversation else 0
        row["booked"] += 1 if any(term in tags for term in ["book", "appointment", "calendar"]) else 0
        row["needs_review"] += 1 if any(term in tags for term in ["ai off", "stop", "unsubscribe"]) else 0

    return {
        "source_count": len(by_source),
        "sources": sorted(by_source.values(), key=lambda row: (-row["leads"], row["source"]))[:20],
    }


def records_from(response: dict[str, Any], key: str) -> list[dict[str, Any]]:
    if not response.get("ok"):
        return []

    data = response.get("data")

    if isinstance(data, dict) and isinstance(data.get(key), list):
        return [row for row in data[key] if isinstance(row, dict)]

    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]

    return []


def nested_get(value: Any, path: list[str]) -> Any:
    current = value

    for key in path:
        if not isinstance(current, dict):
            return None

        current = current.get(key)

    return current


def first_value(records: list[dict[str, Any]], keys: list[str]) -> Any:
    for record in records:
        for key in keys:
            if record.get(key):
                return record[key]

    return None


def count_matching(rows: list[str], terms: list[str]) -> int:
    return sum(1 for row in rows if any(term in row for term in terms))


def counter_items(counter: Counter[Any], limit: int) -> list[dict[str, Any]]:
    return [{"name": str(name), "count": count} for name, count in counter.most_common(limit)]


def summarize_unknown_collection(data: Any) -> dict[str, Any]:
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, list):
                return {
                    "collection_key": key,
                    "count": len(value),
                    "sample_keys": sample_keys(value),
                    "sample_items": sample_items(value),
                }

        return {"type": "object", "keys": list(data.keys())[:20]}

    if isinstance(data, list):
        return {"type": "list", "count": len(data), "sample_keys": sample_keys(data)}

    return {"type": type(data).__name__}


def sample_keys(value: list[Any]) -> list[str]:
    for item in value:
        if isinstance(item, dict):
            return list(item.keys())[:20]

    return []


def sample_items(value: list[Any]) -> list[dict[str, Any]]:
    items = []

    for item in value:
        if not isinstance(item, dict):
            continue

        items.append(
            {
                "id": item.get("id"),
                "name": item.get("name"),
                "status": item.get("status"),
                "version": item.get("version"),
                "updatedAt": item.get("updatedAt"),
            }
        )

        if len(items) >= 20:
            break

    return items


def extract_message(body: Any) -> str:
    if isinstance(body, dict):
        return str(body.get("message") or body.get("error") or body)

    return str(body)


def compact_report(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "account": report["account"]["key"],
        "generated_at": report["generated_at"],
        "report_path": report["report_path"],
        "contacts": report["checks"]["contacts"],
        "conversations": report["checks"]["conversations"],
        "ai_agent_signals": report["checks"]["ai_agent_signals"],
    }


def write_report(root: Path, out_dir: Path, name: str, data: dict[str, Any]) -> Path:
    target_dir = out_dir if out_dir.is_absolute() else root / out_dir
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / f"{name}-{slug_timestamp()}.json"
    path.write_text(json.dumps(data, indent=2, sort_keys=True))
    return path


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def slug_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def print_json(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
