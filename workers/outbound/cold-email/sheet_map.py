"""Fold incoming CSV headers onto the filter/opener dialect.

Origami Title Case, snake_case, Maps title, Apify verify, and a few
renames all read as the same keys. Extra columns stay on the row.
Does not invent values. Empty stays empty.
"""

from __future__ import annotations

import json
import re

# Target key <- incoming header after lowercasing (spaces kept for lookup).
HEADER_ALIASES = {
    "business name": "business_name",
    "company": "business_name",
    "company name": "business_name",
    "company_name": "business_name",
    "store name": "business_name",
    "store_name": "business_name",
    "trading name": "business_name",
    "trading_name": "business_name",
    "title": "business_name",
    "raw data": "raw_data",
    "first name": "first_name",
    "firstname": "first_name",
    "given name": "first_name",
    "given_name": "first_name",
    "last name": "last_name",
    "lastname": "last_name",
    "surname": "last_name",
    "hours claim": "hours_claim",
    "review count": "review_count",
    "reviews": "review_count",
    "google reviews count": "review_count",
    "google_reviews_count": "review_count",
    "rating count": "review_count",
    "rating_count": "review_count",
    "ownership type": "ownership_type",
    "number of stores": "num_stores",
    "num stores": "num_stores",
    "order platforms": "order_platforms",
    "staff role": "staff_role",
    "google rating": "google_rating",
    "primary email": "primary_email",
    "email address": "primary_email",
    "email_address": "primary_email",
    "work email": "primary_email",
    "work_email": "primary_email",
    "verified email": "primary_email",
    "verified_email": "primary_email",
    "email status": "email_status",
    "verify status": "email_status",
    "verify_status": "email_status",
    "verification status": "email_status",
    "verification_status": "email_status",
    "email_verify_status": "email_status",
    "email quality": "email_quality",
    "paid demand": "paid_demand",
    "website url": "website",
    "website_url": "website",
    "url": "website",
    "site": "website",
    "maps url": "maps_url",
    "maps_url": "maps_url",
    "google maps url": "maps_url",
}

VERIFY_STATUS = {
    "ok": "ok",
    "valid": "ok",
    "deliverable": "ok",
    "good": "ok",
    "catch_all": "catch_all",
    "catch-all": "catch_all",
    "catchall": "catch_all",
    "accept_all": "catch_all",
    "accept-all": "catch_all",
    "acceptall": "catch_all",
    "unknown": "unknown",
    "error": "error",
    "timeout": "error",
    "risky": "risky",
    "invalid": "invalid",
    "undeliverable": "invalid",
    "bounce": "invalid",
    "bounced": "invalid",
    "bad": "invalid",
    "missing": "missing",
    "dangerous": "dangerous",
    "disposable": "dangerous",
}

VERIFY_QUALITY = {
    "good": "good",
    "risky": "risky",
    "none": "none",
    "bad": "bad",
    "dangerous": "dangerous",
}

_EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)


def fold_header(key: str) -> str:
    text = (key or "").lstrip("\ufeff").strip()
    return re.sub(r"[\s\-]+", "_", text).lower()


def _space_key(snake: str) -> str:
    return snake.replace("_", " ")


def _filled(value) -> bool:
    if value is None:
        return False
    text = str(value).strip()
    return bool(text) and text.lower() not in {"null", "none", "n/a", "-"}


def is_verified_email_header(name: str) -> bool:
    return fold_header(name) == "verified_email"


def has_verified_email_column(fieldnames) -> bool:
    return any(is_verified_email_header(h) for h in (fieldnames or []))


def require_verified_email_column(fieldnames, *, job: str) -> None:
    if has_verified_email_column(fieldnames):
        return
    raise SystemExit(
        f"{job}: sheet is not marked verified. After the ICP filter, site extract, and verify, "
        "promote a recorded verification result with mark_verified_email.py before openers."
    )


def first_email(value) -> str:
    """First published address from a cell (string, list, or JSON)."""
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        for item in value:
            found = first_email(item)
            if found:
                return found
        return ""
    if isinstance(value, dict):
        return first_email(
            value.get("email") or value.get("value") or value.get("address") or ""
        )
    text = str(value).strip()
    if not text:
        return ""
    if text[:1] in "[{":
        try:
            parsed = json.loads(text)
        except (TypeError, json.JSONDecodeError):
            parsed = None
        if parsed is not None:
            found = first_email(parsed)
            if found:
                return found
    match = _EMAIL_RE.search(text)
    return match.group(0) if match else ""


def normalize_verify_status(value: str) -> str:
    token = re.sub(r"[\s\-]+", "_", (value or "").strip().lower())
    return VERIFY_STATUS.get(token, "")


def normalize_verify_quality(value: str) -> str:
    token = re.sub(r"[\s\-]+", "_", (value or "").strip().lower())
    return VERIFY_QUALITY.get(token, "")


def _set_if_empty(out: dict, key: str, value) -> None:
    if not _filled(out.get(key)) and _filled(value):
        out[key] = value if not isinstance(value, str) else str(value).strip()


def enrich_row(row: dict) -> dict:
    """Copy of the row plus canonical snake_case keys. Original headers kept."""
    out = dict(row)
    for key, val in row.items():
        folded = (key or "").lstrip("\ufeff").strip()
        snake = fold_header(folded)
        if snake and not _filled(out.get(snake)):
            out[snake] = val
        alias = HEADER_ALIASES.get(folded.lower()) or HEADER_ALIASES.get(_space_key(snake))
        if alias and not _filled(out.get(alias)):
            out[alias] = val

    email = first_email(
        out.get("verified_email")
        or out.get("primary_email")
        or out.get("email")
        or out.get("work_email")
        or out.get("emails")
    )
    if email:
        if not _filled(out.get("verified_email")) and any(
            is_verified_email_header(k) for k in row
        ):
            out["verified_email"] = email
        if not _filled(out.get("primary_email")):
            out["primary_email"] = email
        if not _filled(out.get("email")):
            out["email"] = email

    status_raw = ""
    for key in ("email_status", "email_verify_status", "verify_status", "verification_status"):
        if _filled(out.get(key)):
            status_raw = str(out.get(key) or "")
            break
    if not status_raw and _filled(out.get("status")):
        if normalize_verify_status(str(out.get("status") or "")):
            status_raw = str(out.get("status") or "")
    status = normalize_verify_status(status_raw)
    if status:
        out["email_status"] = status

    quality_raw = str(out.get("email_quality") or "")
    if not _filled(quality_raw) and _filled(out.get("quality")):
        if normalize_verify_quality(str(out.get("quality") or "")):
            quality_raw = str(out.get("quality") or "")
    quality = normalize_verify_quality(quality_raw)
    if quality:
        out["email_quality"] = quality

    return out


def email_verification_eligible(row: dict) -> bool:
    """A recorded verifier result is required; a column name is not evidence.

    Unknown/catch-all/error results remain eligible under the existing policy.
    A missing result, or a quality label alone, does not mean verification ran.
    """
    view = enrich_row(row)
    status = normalize_verify_status(str(view.get("email_status") or ""))
    quality = normalize_verify_quality(str(view.get("email_quality") or ""))
    return status in {"ok", "catch_all", "unknown", "risky", "error"} and quality not in {
        "none", "bad", "dangerous"
    }


def outreach_exclusion(row: dict, *, require_uncontacted: bool = False) -> str:
    view = enrich_row(row)
    if str(view.get("is_archived") or "").lower() in {"true", "1"}:
        return "archived"
    if str(view.get("recontact_ok", "")).lower() in {"0", "false"}:
        return "recontact_not_allowed"
    if view.get("suppression_reason"):
        return "suppressed"
    if str(view.get("icp_status") or "").lower() == "skip":
        return "icp_skip"
    if view.get("eligibility_reason"):
        return str(view["eligibility_reason"])
    status = str(view.get("outbound_status") or "").lower()
    if status != "uncontacted" and (status or require_uncontacted):
        return "not_confirmed_uncontacted"
    return ""


def pick(row: dict, *keys: str, default: str = "") -> str:
    view = enrich_row(row)
    for key in keys:
        val = view.get(key)
        if _filled(val):
            return str(val).strip()
    return default
