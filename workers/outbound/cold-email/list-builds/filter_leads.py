#!/usr/bin/env python3
"""
filter_leads.py - Cheap anti-ICP walk.

Splits an input CSV into:
  1. Sendable: passed the name/trade walk and dedupe. Email may still be blank or unverified.
  2. Unsendable: walked by anti-ICP or duplicate domain/email.

Email verify and homepage extract run after this job, on the sendable sheet only.
leak_score is an extra column. It is not a filter.

Usage:
  python3 filter_leads.py <input_csv_path> --trade plumber
"""

import argparse
import csv
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
_COLD_EMAIL = SCRIPT_DIR.parent
if str(_COLD_EMAIL) not in sys.path:
    sys.path.insert(0, str(_COLD_EMAIL))
from sheet_map import enrich_row, fold_header, require_verified_email_column
from vertical_spec import identity_for_trade, other_trade_identities
KEEP_IN_NAMES = {".gitkeep"}
SIDECAR_TOKENS = (
    "scored",
    "normalized",
    "independent",
    "skips",
    "backup",
    "pipeline",
    "verify",
    "verification",
    "all-emails",
    "safe-email",
    "no-safe-email",
)

def is_raw_col(name: str) -> bool:
    return fold_header(name) == "raw_data"


PAID_DEMAND_KEYS = (
    ("hipages", ("hipages", "hi pages")),
    ("google ads", ("google ads", "google adwords", "google ad ", "pay per click", "ppc ads")),
    ("meta ads", ("meta ads", "facebook ads", "instagram ads")),
)


def has_paid_demand_column(row: dict) -> bool:
    """Hipages / Google Ads / Meta Ads on paid_demand only. Not raw_data."""
    text = (enrich_row(row).get("paid_demand") or "").strip().lower()
    if not text:
        return False
    return any(key in text for _, keys in PAID_DEMAND_KEYS for key in keys)


def is_sendable_email(row: dict) -> bool:
    """Check if the row contains a sendable email based on status and quality."""
    row = enrich_row(row)
    st = (row.get("email_status") or "").lower().strip()
    q = (row.get("email_quality") or "").lower().strip()
    em = (row.get("verified_email") or row.get("primary_email") or row.get("email") or "").strip()

    if not em:
        return False
    if st in {"missing", "invalid", "dangerous"} or q in {"none", "bad", "dangerous"}:
        return False
    if st in {"ok", "catch_all", "unknown", "risky", "error", "timeout"} or q in {"good", "risky"}:
        return True
    return False


def email_exclusion_reason(row: dict) -> str | None:
    """Walk reason when the address is missing, invalid, or unverified. None if sendable."""
    row = enrich_row(row)
    em = (row.get("verified_email") or row.get("primary_email") or row.get("email") or "").strip()
    st = (row.get("email_status") or "").lower().strip()
    q = (row.get("email_quality") or "").lower().strip()
    if not em or st == "missing":
        return "missing_email"
    if st in {"invalid", "dangerous"} or q in {"none", "bad", "dangerous"}:
        return "invalid_email"
    if is_sendable_email(row):
        return None
    return "unusable_email"


def is_roof_tiler(bname: str, trade: str, campaign_trade: str | None = None) -> bool:
    """Roof tiling shops stay. Bathroom / kitchen tilers still walk."""
    ct = (campaign_trade or "").strip().lower()
    roof_in_name = bool(re.search(r"\broof\b", bname, re.I))
    roof_in_trade = bool(re.search(r"\broof\b", trade, re.I))
    if roof_in_name or roof_in_trade:
        return True
    if ct in {"roofing", "roofer"} and (roof_in_name or roof_in_trade):
        return True
    return False


def resolve_business_name(row: dict) -> str:
    """Safely resolve business name if missing or blank."""
    row = enrich_row(row)
    bname = (row.get("business_name") or row.get("company") or row.get("company_name") or "").strip()
    if bname:
        return bname
    
    # 1. Try parsing Google Maps place URL
    murl = (row.get("maps_url") or "").strip()
    m = re.search(r"/maps/place/([^/@]+)", murl)
    if m:
        extracted = unquote(m.group(1)).replace("+", " ").strip()
        if extracted:
            return extracted
            
    # 2. Try raw_data store/brand name
    raw_str = (row.get("raw_data") or "").strip()
    if raw_str.startswith("{") and raw_str.endswith("}"):
        try:
            raw = json.loads(raw_str)
            raw_name = raw.get("store_name") or raw.get("business_name")
            if raw_name:
                return str(raw_name).strip()
        except Exception:
            pass

    # 3. Fallback to clean domain from website
    site = (row.get("website") or "").strip()
    if site:
        dom = site.split("//")[-1].split("/")[0].replace("www.", "").strip()
        if dom:
            return dom

    # 4. Fallback to email domain
    em = (row.get("verified_email") or row.get("primary_email") or row.get("email") or "").strip()
    if em and "@" in em:
        return em.split("@")[-1]

    return ""


def get_root_domain(website: str) -> str:
    """Extract normalized root domain."""
    site = (website or "").strip()
    if not site:
        return ""
    if "://" not in site:
        site = "https://" + site
    try:
        host = (urlparse(site).hostname or "").lower()
        return host.removeprefix("www.")
    except Exception:
        return ""


def parse_raw_data(row: dict) -> dict | None:
    """Return parsed raw_data JSON, or None if the scrape payload is absent."""
    raw_str = (enrich_row(row).get("raw_data") or "").strip()
    if not raw_str.startswith("{") or not raw_str.endswith("}"):
        return None
    try:
        parsed = json.loads(raw_str)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def _normalize_hours_text(text: str) -> str:
    return re.sub(r"[\u202f\u00a0\u2007\u2009]", " ", text or "")


HOURS_CLAIM_TERMS = (
    "24/7",
    "24-7",
    "24hr",
    "24 hour",
    "24 hours",
    "emergency",
    "after-hours",
    "after hours",
    "open 24 hours",
)
TWENTY_FOUR_HOURS_RE = re.compile(
    r"\b(open\s+24\s+hours|24\s+hours|24\s*/\s*7|24-7|24hr|24\s*hour)\b",
    re.I,
)
HOUR_RANGE_RE = re.compile(
    r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?"
    r"\s*(?:[-–]|to)\s*"
    r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?",
    re.I,
)
CLOSE_AT_RE = re.compile(
    r"close[s]?\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?",
    re.I,
)
OWNER_ROLE_RE = re.compile(r"\b(owner|founder|proprietor|sole\s+trader)\b", re.I)
BOOKING_RE = re.compile(
    r"\b(book\s+online|online\s+booking|booking\s+widget|book\s+now|book\s+a\s+job|live\s+availability)\b",
    re.I,
)
BOOKING_PLATFORM_RE = re.compile(
    r"servicem8|housecallpro|jobber|simplybook|calendly|setmore|acuityscheduling",
    re.I,
)
ANSWERING_SERVICE_RE = re.compile(
    r"\b("
    r"24\s*/?\s*7\s+live\s+answering|"
    r"live\s+answering|"
    r"answering\s+service|"
    r"virtual\s+receptionist|"
    r"after[\s-]*hours\s+answering|"
    r"call\s+answering"
    r")\b",
    re.I,
)
FAMILY_OWNERSHIP = {"FAMILY", "SOLE_TRADER", "SOLE TRADER", "OWNER_OPERATOR", "OWNER OPERATOR"}


def _row_text_blob(row: dict, raw: dict | None) -> str:
    raw = raw or {}
    row = enrich_row(row)
    parts = [
        row.get("hours_claim") or "",
        row.get("hours") or "",
        row.get("services") or "",
        row.get("specialty") or "",
        row.get("trade") or "",
        row.get("category") or "",
        row.get("business_name") or "",
        row.get("company") or "",
        raw.get("brand_description") or "",
        raw.get("business_specialty") or "",
        " ".join(raw.get("product_services_offered") or [])
        if isinstance(raw.get("product_services_offered"), list)
        else (raw.get("product_services_offered") or ""),
        " ".join(raw.get("business_keywords") or [])
        if isinstance(raw.get("business_keywords"), list)
        else (raw.get("business_keywords") or ""),
        " ".join(raw.get("tags") or []) if isinstance(raw.get("tags"), list) else (raw.get("tags") or ""),
    ]
    return _normalize_hours_text(" ".join(str(p) for p in parts if p))


def _to_minutes(hour: str, minute: str | None, ampm: str | None) -> int | None:
    try:
        h = int(hour)
        m = int(minute or 0)
    except ValueError:
        return None
    if h > 24 or m > 59:
        return None
    mer = (ampm or "").lower()
    if mer == "pm" and h != 12:
        h += 12
    elif mer == "am" and h == 12:
        h = 0
    if h == 24:
        h = 0
    return h * 60 + m


def _range_end_minutes(h1, m1, ap1, h2, m2, ap2) -> int | None:
    end_ap = ap2
    if not ap1 and not ap2:
        try:
            end_h = int(h2)
        except ValueError:
            return None
        if end_h <= 12:
            end_ap = "pm"
    return _to_minutes(h2, m2, end_ap)


def _weekday_close_minutes(hours_text: str) -> list[int]:
    text = _normalize_hours_text(hours_text)
    if not text.strip():
        return []
    if TWENTY_FOUR_HOURS_RE.search(text) and not HOUR_RANGE_RE.search(text):
        return []
    closes: list[int] = []
    for match in HOUR_RANGE_RE.finditer(text):
        end = _range_end_minutes(*match.groups())
        if end is not None:
            closes.append(end)
    for match in CLOSE_AT_RE.finditer(text):
        end = _to_minutes(*match.groups())
        if end is not None:
            closes.append(end)
    return closes


def _has_hours_claim_signal(row: dict, blob: str) -> bool:
    """Signal 1 (close at/before 5pm, no 24h) or a 24/7 / emergency hours claim."""
    row = enrich_row(row)
    hours_text = _normalize_hours_text(
        f"{row.get('hours') or ''} {row.get('hours_claim') or ''}"
    )
    operating_24h = bool(TWENTY_FOUR_HOURS_RE.search(hours_text))
    closes = _weekday_close_minutes(hours_text)
    early_close = bool(closes) and all(m <= 17 * 60 for m in closes) and not operating_24h
    claim = any(term in blob.lower() for term in HOURS_CLAIM_TERMS)
    return early_close or claim


def _has_owner_led_review_pattern(row: dict, raw: dict | None) -> bool:
    """Owner-led pattern from scrape fields. Blank if raw_data is missing (never guess)."""
    if raw is None:
        return False
    staffs = raw.get("staffs") if isinstance(raw.get("staffs"), list) else []
    if any(
        isinstance(staff, dict) and OWNER_ROLE_RE.search(str(staff.get("role") or ""))
        for staff in staffs
    ):
        return True
    ownership = (raw.get("ownership_type") or "").strip().upper().replace("-", "_")
    if ownership in FAMILY_OWNERSHIP:
        return True
    if ownership == "INDEPENDENT":
        first = (enrich_row(row).get("first_name") or "").strip()
        named_staff = any(
            isinstance(staff, dict) and str(staff.get("name") or "").strip()
            for staff in staffs
        )
        return bool(first or named_staff)
    return False


def _has_order_platforms(raw: dict) -> bool:
    platforms = raw.get("order_platforms")
    if platforms is None or platforms == "" or platforms == [] or platforms == {}:
        return False
    return True


def _has_booking_widget(row: dict, raw: dict | None, blob: str) -> bool:
    """True when a booking path is on the row. Missing raw_data is unknown, not a yes."""
    if BOOKING_RE.search(blob):
        return True
    website = enrich_row(row).get("website") or ""
    if BOOKING_PLATFORM_RE.search(website):
        return True
    if raw is None:
        return False
    return _has_order_platforms(raw)


def _has_answering_service(blob: str) -> bool:
    if re.search(r"\b(without|no|not\s+a)\s+(call[\s-]*cent(?:re|er)|answering\s+service)\b", blob, re.I):
        return False
    return bool(ANSWERING_SERVICE_RE.search(blob))


def evaluate_leak_signals(row: dict) -> dict:
    """Answering / booking widget only. Negative for opener, never a drop."""
    raw = parse_raw_data(row)
    blob = _row_text_blob(row, raw)
    booking_widget = _has_booking_widget(row, raw, blob)
    answering_service = _has_answering_service(blob)
    score = -int(booking_widget) - int(answering_service)
    return {
        "booking_widget": booking_widget,
        "answering_service": answering_service,
        "leak_score": score,
    }


def compute_leak_score(row: dict) -> int:
    return evaluate_leak_signals(row)["leak_score"]


def evaluate_anti_icp(row: dict, campaign_trade: str | None = None) -> str | None:
    """
    Cautiously evaluate Anti-ICP rules against a lead.
    Returns disqualification reason string if disqualified, or None if passed.
    campaign_trade is the Instantly / --trade folder (plumber, hvac, electrical, locksmith, roofing, pest).
    """
    row = enrich_row(row)
    bname = resolve_business_name(row)
    trade = (row.get("trade") or "").strip()
    services = (row.get("services") or "").strip()
    email = (row.get("verified_email") or row.get("primary_email") or row.get("email") or "").strip().lower()
    
    # Safely parse raw_data if available
    raw = {}
    raw_str = row.get("raw_data") or "{}"
    if raw_str.startswith("{") and raw_str.endswith("}"):
        try:
            raw = json.loads(raw_str)
        except Exception:
            raw = {}

    tags = raw.get("tags") or []
    tags_str = " ".join(tags).lower() if isinstance(tags, list) else ""
    category = (row.get("categoryName") or row.get("category_name") or "").strip()
    categories = row.get("categories") or ""
    if isinstance(categories, list):
        categories = "; ".join(str(c) for c in categories)
    ident_blob = f"{bname} | {trade} | {category} | {categories}".lower()
    ident_primary = f"{bname} | {trade} | {category}".lower()
    blob_name_trade = ident_blob
    ct = (campaign_trade or "").strip().lower()
    name_has_trade = bool(re.search(r"(plumb|gasfit|electri|\bhvac\b|aircon|roof)", bname, re.I))
    self_hit = bool(ct and re.search(identity_for_trade(ct), ident_blob, re.I))

    # 1. Associations, Institutes & Trade Unions
    if re.search(r"\b(master plumbers|master builders|association|institute of plumbing|trade union)\b", bname, re.I) or trade == "Industry Association":
        return "disqualified_association"

    # 2. Directories, Aggregators & Marketing Portals
    if re.search(r"\b(directory|local search|yellow pages|advertise your business|marketing portal)\b", bname, re.I) or "automated task management" in trade.lower():
        return "disqualified_directory"

    # 3. Supply Stores, Wholesalers & Equipment Sales
    primary_kind = f"{trade} {category}".lower()
    if any(k in primary_kind for k in ["supply", "supplier", "store", "apparel", "manufacturer", "pump supply", "safety equipment", "blinds", "awning"]):
        return "disqualified_supplier_or_store"
    if re.search(r"\b(plumbing supplies|industrial supply|wholesale|wholesaler|supplier|manufacturer|apparel|pump supply|sydney pumps|safety equipment|ladder supplier|awning supplier|blinds shop)\b", ident_primary, re.I):
        return "disqualified_supplier_or_store"

    # 4. Facilities Management & Commercial Property Maintenance
    if ("facilities management" in trade.lower() or "facilities maintenance" in trade.lower()) and not any(k in trade.lower() for k in ["plumbing and", "plumber"]):
        return "disqualified_facility_management"
    if trade in ["Property Services", "Property Repairs and Maintenance Service", "Commercial Property Maintenance"]:
        return "disqualified_facility_management"
    if re.search(r"\b(facilities group|facility management|facility services|facilit(?:y|ies)\s+(?:management|maintenance|services)|valan property|fj group)\b", blob_name_trade, re.I):
        return "disqualified_facility_management"

    # 5. Non-Trade / Pure Civil Infrastructure / Demolition / Construction Companies
    non_trade_exact_trades = {
        "Construction Company",
        "Construction and 3D Rendering",
        "Mortgage Investment Services",
        "Event Services",
        "Technology Company",
        "Utility Locating Services",
        "Civil Contracting Company",
        "Civil and Infrastructure Contractors",
        "Appliance Repair Service",
        "Handyman Services",
        "Water and mould damage restoration service",
        "Electrical & Telecommunication Specialists",
        "Fire Protection and Pump Servicing",
        "Tree Service",
        "Tree Removal Service",
        "Asbestos Testing Service",
        "Environmental Consultant",
        "Blinds Shop",
        "Awning Supplier",
    }
    if trade in non_trade_exact_trades:
        return "disqualified_non_trade_or_civil"
    if re.search(r"\b(construction group|construction services in chatswood|event services|suresearch|demolition|handyman|best repairs|restored right|complete contracting|complete pumps)\b", bname, re.I):
        return "disqualified_non_trade_or_civil"
    if re.search(r"\bcivil\b", bname, re.I):
        return "disqualified_non_trade_or_civil"
    if re.search(r"\bcontracting\b", bname, re.I) and not name_has_trade and not self_hit:
        return "disqualified_non_trade_or_civil"
    if re.search(r"\b(kitchens?|cleaning|renovation|estimating|industrial maintenance|type b gas|declutter|downsizing|tree service|tree removal|arborist|tree lopping|height safety|roof anchors?|anchor safe|asbestos|wallpaper|cladding|composite panel)\b", bname, re.I):
        return "disqualified_non_trade_or_civil"
    tiling_hit = bool(re.search(r"\b(tilers?|tiling)\b", f"{bname} {trade}", re.I))
    if tiling_hit and not is_roof_tiler(bname, trade, campaign_trade):
        return "disqualified_non_trade_or_civil"
    if re.search(r"\bkitchens?\b", trade, re.I):
        return "disqualified_non_trade_or_civil"
    if re.search(r"\b(building services|building contractor|trades services)\b", bname, re.I):
        return "disqualified_non_trade_or_civil"
    if re.search(r"\bprojects\b", bname, re.I) and not name_has_trade and not self_hit:
        return "disqualified_non_trade_or_civil"
    if re.search(r"\bbuilders?\b", bname, re.I) and not name_has_trade and not self_hit:
        return "disqualified_non_trade_or_civil"

    # 6. Corporate Head Office / Multi-location National Chains
    if "corporate office" in tags_str and raw.get("num_stores", 0) > 1 and "group" in bname.lower():
        return "disqualified_head_office_or_national"
    if re.search(r"\b(jim'?s|o'?brien plumbing|reece)\b", bname, re.I):
        return "disqualified_national_franchise"
    if email.startswith("privacy@") or "@veolia." in email:
        return "disqualified_head_office_or_national"
    if re.search(r"\bgroup\b", bname, re.I) and not name_has_trade and not self_hit:
        return "disqualified_head_office_or_national"

    # 7. Mismatched Entity / Scraping Artifacts / Web Agencies
    if any(dom in email for dom in ["nemisis.com.au", "web-design-agency.com.au"]):
        return "disqualified_mismatched_entity"
    if re.search(r"\bis a\b", bname, re.I):
        return "disqualified_mismatched_entity"

    if ct:
        self_pat = identity_for_trade(ct)
        if not re.search(self_pat, ident_blob, re.I):
            if any(re.search(p, ident_blob, re.I) for p in other_trade_identities(ct)):
                return "disqualified_mismatched_entity"

    return None


def run_filter(
    input_path: Path,
    output_dir: Path | None = None,
    campaign_trade: str | None = None,
    require_paid_demand: bool = False,
    require_verified_email: bool = False,
) -> tuple[Path, Path]:
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    with input_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    if not fieldnames:
        raise ValueError("Input CSV has no headers.")
    if require_verified_email:
        require_verified_email_column(fieldnames, job="filter_leads.py")

    # Determine output paths
    out_dir = output_dir or input_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    stem = input_path.stem
    match = re.search(r"^(.*?)(?:-(\d{6,8}))?$", stem)
    base_name = match.group(1) if match else stem
    date_suffix = f"-{match.group(2)}" if (match and match.group(2)) else ""

    sendable_path = out_dir / f"{base_name}-sendable{date_suffix}.csv"
    unsendable_path = out_dir / f"{base_name}-unsendable{date_suffix}.csv"

    sendable_rows = []
    unsendable_rows = []

    seen_domains = set()
    seen_emails = set()

    for r in rows:
        view = enrich_row(r)
        email = (view.get("verified_email") or view.get("primary_email") or view.get("email") or "").strip().lower()
        site_domain = get_root_domain(view.get("website") or view.get("website_url") or "")

        leak_score = compute_leak_score(view)
        disqualification = evaluate_anti_icp(view, campaign_trade=campaign_trade)

        if disqualification:
            r_unsendable = dict(r)
            r_unsendable["leak_score"] = leak_score
            r_unsendable["exclusion_reason"] = disqualification
            unsendable_rows.append(r_unsendable)
        elif require_paid_demand and not has_paid_demand_column(view):
            r_unsendable = dict(r)
            r_unsendable["leak_score"] = leak_score
            r_unsendable["exclusion_reason"] = "missing_paid_demand"
            unsendable_rows.append(r_unsendable)
        # Deduplication check for sendable leads
        elif email and email in seen_emails:
            r_unsendable = dict(r)
            r_unsendable["leak_score"] = leak_score
            r_unsendable["exclusion_reason"] = "duplicate_email"
            unsendable_rows.append(r_unsendable)
        elif site_domain and site_domain in seen_domains:
            r_unsendable = dict(r)
            r_unsendable["leak_score"] = leak_score
            r_unsendable["exclusion_reason"] = "duplicate_domain"
            unsendable_rows.append(r_unsendable)
        else:
            if email:
                seen_emails.add(email)
            if site_domain:
                seen_domains.add(site_domain)
            r_sendable = dict(r)
            r_sendable["leak_score"] = leak_score
            sendable_rows.append(r_sendable)

    # Prepare fieldnames ensuring raw_data is always rightmost
    def arrange_fields(fields: list[str], extra_fields: list[str]) -> list[str]:
        base = [f for f in fields if not is_raw_col(f) and f not in extra_fields]
        res = base + extra_fields
        raw_cols = [f for f in fields if is_raw_col(f)]
        res.extend(raw_cols)
        return res

    sendable_fields = arrange_fields(fieldnames, ["leak_score"])
    unsendable_fields = arrange_fields(fieldnames, ["leak_score", "exclusion_reason"])

    # Write Sendable CSV
    with sendable_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=sendable_fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(sendable_rows)

    # Write Unsendable CSV
    with unsendable_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=unsendable_fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(unsendable_rows)

    print(f"--- Filter Summary for {input_path.name} ---")
    print(f"Total Input Rows:       {len(rows)}")
    print(f"Sendable Leads (Clean): {len(sendable_rows)} -> {sendable_path}")
    print(f"Unsendable Leads:       {len(unsendable_rows)} -> {unsendable_path}")
    
    reasons = Counter(r.get("exclusion_reason", "unknown") for r in unsendable_rows)
    print("\nExclusion Breakdown:")
    for reason, count in reasons.most_common():
        print(f"  {count:>4}: {reason}")

    print("\nUnsendable rows (name | reason | email):")
    for r in unsendable_rows:
        view = enrich_row(r)
        name = resolve_business_name(view)
        reason = r.get("exclusion_reason") or "unknown"
        email = (view.get("verified_email") or view.get("primary_email") or view.get("email") or "").strip()
        print(f"  {name} | {reason} | {email}")

    leak_counts = Counter(r.get("leak_score", 0) for r in sendable_rows)
    if leak_counts:
        print("\nSendable leak_score (not a filter):")
        for score, count in sorted(leak_counts.items(), reverse=True):
            print(f"  {count:>4}: leak_score={score}")

    return sendable_path, unsendable_path


def _is_sidecar(path: Path) -> bool:
    name = path.name.lower()
    if path.suffix.lower() in {".json", ".txt"}:
        return True
    return any(token in name for token in SIDECAR_TOKENS)


def cleanup_temps(out_dir: Path | None = None) -> list[Path]:
    """Retain raw discovery, evidence and receipts until explicit retention review."""
    return []


def main():
    parser = argparse.ArgumentParser(description="Filter leads against Anti-ICP rules. Email verify runs after this job.")
    parser.add_argument("input_csv", type=str, help="Path to input lead CSV")
    parser.add_argument("--out-dir", type=str, default=None, help="Directory to save output CSVs")
    parser.add_argument(
        "--trade",
        type=str,
        required=True,
        help="Trade folder under out/ (plumber, hvac, ...). Required so mismatch walk fires.",
    )
    parser.add_argument(
        "--require-paid-demand",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Optional gate: walk rows with no Hipages / Google Ads / Meta Ads on paid_demand. Default is False (keeps all established shops).",
    )
    parser.add_argument(
        "--require-verified-email",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Require a verified_email column. Default is off: ICP walk runs before verify.",
    )

    args = parser.parse_args()
    input_path = Path(args.input_csv).resolve()
    if args.out_dir:
        out_dir = Path(args.out_dir).resolve()
    elif args.trade:
        out_dir = SCRIPT_DIR / "out" / args.trade.lower().strip()
    else:
        out_dir = SCRIPT_DIR / "out"

    sendable_path, unsendable_path = run_filter(
        input_path,
        out_dir,
        campaign_trade=args.trade,
        require_paid_demand=args.require_paid_demand,
        require_verified_email=args.require_verified_email,
    )
    cleanup_temps(out_dir)
    return sendable_path, unsendable_path


if __name__ == "__main__":
    main()
