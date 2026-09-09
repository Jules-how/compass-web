#!/usr/bin/env python3
"""Check draft settings and optional lead rendering; upload needs its own receipt.

Dump the Instantly MCP `get_campaign` JSON to a file, then:

  python3 check_campaign.py /tmp/campaign.json --timezone Australia/Sydney
  cat /tmp/campaign.json | python3 check_campaign.py - --timezone Australia/Perth

Asserts the locked preset: draft, 2+ day gap before every follow-up, city
timezone, text_only on, open/link tracking off, insert_unsubscribe_header on,
stop_on_reply on, Email 1 starts {{personalization}}.

Exit 0 pass, 1 a check failed, 2 unreadable input.
"""

from __future__ import annotations

import argparse
import csv
import html as html_lib
import json
import math
import re
import sys
from pathlib import Path

OS_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(OS_ROOT / "cold-email"))
from sheet_map import email_verification_eligible, outreach_exclusion, pick

DRAFT_STATUSES = {0, "0", "draft"}
AU_ZONES = {
    "Australia/Sydney",
    "Australia/Melbourne",
    "Australia/Brisbane",
    "Australia/Perth",
    "Australia/Adelaide",
    "Australia/Darwin",
    "Australia/Hobart",
}
MIN_GAP_DAYS = 2


def unwrap(payload):
    """Accept the raw campaign object or an MCP/envelope wrapper."""
    seen = set()
    node = payload
    while isinstance(node, dict) and id(node) not in seen:
        seen.add(id(node))
        if "sequences" in node or "campaign_schedule" in node or "status" in node:
            return node
        for key in ("campaign", "data", "result"):
            nxt = node.get(key)
            if isinstance(nxt, dict):
                node = nxt
                break
        else:
            return node
    return node if isinstance(node, dict) else {}


def email_steps(campaign: dict) -> list[dict]:
    sequences = campaign.get("sequences") or []
    steps: list[dict] = []
    if isinstance(sequences, list):
        for seq in sequences:
            for step in (seq or {}).get("steps") or []:
                if not isinstance(step, dict):
                    continue
                if str(step.get("type") or "email").lower() in {"email", ""}:
                    steps.append(step)
    return steps


def step_bodies(step: dict) -> list[str]:
    variants = step.get("variants")
    if isinstance(variants, list) and variants:
        return [str((v or {}).get("body") or "") for v in variants]
    return [str(step.get("body") or "")]


def visible_text(html: str) -> str:
    """Strip tags so a <div>{{personalization}}</div> house-style wrap still
    reads as starting with the token."""
    spaced = re.sub(r"</(?:div|p)>|<br\s*/?>", "\n", html or "", flags=re.I)
    return html_lib.unescape(re.sub(r"<[^>]+>", "", spaced)).strip()


def check_lead_rendering(campaign: dict, rows: list[dict]) -> list[str]:
    """Check every merge using actual rows. Never send a preview email."""
    fails = []
    seen = set()
    if not rows:
        return ["lead CSV has no rows"]
    for index, row in enumerate(rows, 2):
        email = pick(row, "verified_email", "email").lower()
        prefix = f"CSV row {index}"
        if not email_verification_eligible(row):
            fails.append(f"{prefix}: verification result missing or ineligible")
        excluded = outreach_exclusion(row, require_uncontacted=True)
        if excluded:
            fails.append(f"{prefix}: Compass eligibility exclusion: {excluded}")
        if not email or "@" not in email:
            fails.append(f"{prefix}: missing email")
        if email in seen:
            fails.append(f"{prefix}: duplicate email")
        seen.add(email)
        values = dict(row)
        values.update({
            "firstName": pick(row, "firstName", "first_name"),
            "personalization": pick(row, "personalization", "opener"),
            "unsubscribe": "https://unsubscribe.example.test",
        })
        if not values["personalization"] or not pick(row, "subject") or not pick(row, "suburb"):
            fails.append(f"{prefix}: missing personalization, subject, or suburb")
        for step_index, step in enumerate(email_steps(campaign), 1):
            for variant in step.get("variants") or [step]:
                body = str(variant.get("body") or "")
                subject = str(variant.get("subject") or "")
                missing = set()
                def replace(match):
                    key = match.group(1)
                    if key not in values or not str(values.get(key) or "").strip():
                        missing.add(key)
                    return str(values.get(key) or "")
                rendered = re.sub(r"\{\{\s*(\w+)\s*\}\}", replace, subject + "\n" + body)
                if missing or re.search(r"\{\{?.+?\}?\}", rendered):
                    fails.append(f"{prefix} email {step_index}: unresolved variables {sorted(missing)}")
                if re.search(r"\b(?:Hi|Hey|Hello)\s*[,!]", visible_text(rendered)):
                    fails.append(f"{prefix} email {step_index}: blank-name greeting")
    return fails


def truthy(value) -> bool:
    return value is True or value in (1, "1", "true", "True")


def falsy(value) -> bool:
    return value is False or value in (0, "0", "false", "False")


def check_campaign(campaign: dict, timezone: str | None = None, *, allow_weekends: bool = False) -> list[str]:
    """Validate draft settings. This does not prove a lead upload occurred."""
    fails: list[str] = []

    status = campaign.get("status")
    if status not in DRAFT_STATUSES:
        fails.append(f"not a draft (status={status!r})")

    steps = email_steps(campaign)
    if len(steps) < 2:
        fails.append(f"sequence has {len(steps)} email step(s); fill is Email 1 plus bump")
    for i, step in enumerate(steps[:-1]):
        delay = step.get("delay", step.get("delay_days"))
        try:
            days = float(delay)
        except (TypeError, ValueError):
            days = -1
        if not math.isfinite(days) or days < MIN_GAP_DAYS:
            fails.append(
                f"gap after email {i + 1} is {delay!r} days; needs {MIN_GAP_DAYS}+ "
                "(delay sits on the email above the Wait box)"
            )

    schedules = ((campaign.get("campaign_schedule") or {}).get("schedules")) or []
    zones = [str((s or {}).get("timezone") or "") for s in schedules if isinstance(s, dict)]
    if timezone:
        if not zones or any(zone != timezone for zone in zones):
            fails.append(f"timezone {zones or 'missing'} != {timezone}")
    elif not zones or any(z not in AU_ZONES for z in zones):
        fails.append(f"timezone {zones or 'missing'} is not an Australia/* zone")

    day_numbers = {name: str(i) for i, name in enumerate(
        ("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
    )}
    for i, schedule in enumerate(schedules):
        days = schedule.get("days") if isinstance(schedule, dict) else None
        active = set()
        if isinstance(days, dict):
            for key, enabled in days.items():
                day = day_numbers.get(str(key).lower(), str(key))
                if day not in set(day_numbers.values()) or not (truthy(enabled) or falsy(enabled)):
                    fails.append(f"schedule {i + 1} has an invalid day setting: {key!r}")
                elif truthy(enabled):
                    active.add(day)
        if not active:
            fails.append(f"schedule {i + 1} has no enabled sending days")
        if not allow_weekends and active & {"0", "6"}:
            fails.append(f"schedule {i + 1} enables weekends without --allow-weekends")

    if not truthy(campaign.get("text_only")):
        fails.append(f"text_only is {campaign.get('text_only')!r}, must be true")
    for key in ("open_tracking", "link_tracking"):
        if not falsy(campaign.get(key)):
            fails.append(f"{key} is {campaign.get(key)!r}, must be false")
    if not truthy(campaign.get("insert_unsubscribe_header")):
        fails.append(
            f"insert_unsubscribe_header is {campaign.get('insert_unsubscribe_header')!r}, must be true"
        )
    if not truthy(campaign.get("stop_on_reply")):
        fails.append(f"stop_on_reply is {campaign.get('stop_on_reply')!r}, must be true")

    if steps:
        bodies = step_bodies(steps[0])
        if not bodies or not all(
            visible_text(b).startswith("{{personalization}}") for b in bodies
        ):
            fails.append("email 1 does not start with {{personalization}} on every variant")

    for i, step in enumerate(steps, 1):
        for body in step_bodies(step):
            if not re.search(r'<a\b[^>]*href=[\"\']\{\{unsubscribe\}\}[\"\'][^>]*>\s*Unsubscribe\s*</a>', body, re.I):
                fails.append(f"email {i} is missing the visible Unsubscribe link")

    return fails


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Instantly draft gate.")
    parser.add_argument("json_path", help="get_campaign JSON file, or - for stdin")
    parser.add_argument("--timezone", help="expected city tz, e.g. Australia/Perth")
    parser.add_argument("--allow-weekends", action="store_true", help="only when Jules requested weekend sending")
    parser.add_argument("--leads-csv", help="check verification, duplicates and every rendered email before upload")
    args = parser.parse_args(argv)

    try:
        if args.json_path == "-":
            raw = sys.stdin.read()
        else:
            raw = Path(args.json_path).read_text(encoding="utf-8")
        payload = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read campaign JSON: {exc}", file=sys.stderr)
        return 2

    campaign = unwrap(payload)
    if not campaign:
        print("ERROR: no campaign object found in the JSON", file=sys.stderr)
        return 2

    fails = check_campaign(campaign, timezone=args.timezone, allow_weekends=args.allow_weekends)
    if args.leads_csv:
        try:
            with Path(args.leads_csv).open(encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))
            fails.extend(check_lead_rendering(campaign, rows))
        except (OSError, csv.Error) as exc:
            print(f"ERROR: cannot read lead CSV: {exc}", file=sys.stderr)
            return 2
    if fails:
        print("DRAFT SETTINGS FAILED. Fix and rerun:")
        for line in fails:
            print(f"  FAIL {line}")
        return 1
    print("DRAFT SETTINGS VERIFIED (lead upload not checked):")
    print("  draft status")
    print("  every gap before the last email is 2+ days")
    print(f"  timezone {args.timezone or 'is an Australia/* zone'}")
    print("  enabled sending days; weekends only with explicit override")
    print("  text_only on, open/link tracking off, insert_unsubscribe_header on, stop_on_reply on")
    print("  email 1 starts with {{personalization}}")
    if args.leads_csv:
        print(f"  {len(rows)} verified-status rows; every email rendered without missing variables or blank greetings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
