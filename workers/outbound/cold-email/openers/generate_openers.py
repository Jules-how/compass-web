#!/usr/bin/env python3
"""Signal waterfall openers for Fill and Capture trade campaigns.

Reads a list-builds sendable CSV (raw_data JSON column) and writes
openers/out/{trade}/{trade}-{city}-sendable-{YYYYMMDD}.csv.

Paid Demand → Specialty → Fallback on the campaign trade noun.

Usage:
  python3 generate_openers.py --trade plumber --city perth
  python3 generate_openers.py --input path/to.csv --trade hvac --city darwin
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
from datetime import date
from functools import lru_cache
from pathlib import Path
from urllib.parse import unquote_plus, urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
_COLD_EMAIL = SCRIPT_DIR.parent
if str(_COLD_EMAIL) not in sys.path:
    sys.path.insert(0, str(_COLD_EMAIL))
from sheet_map import enrich_row, fold_header, pick, require_verified_email_column, email_verification_eligible, outreach_exclusion
from vertical_spec import (
    all_company_aliases,
    all_shop_sign_phrases,
    all_shop_sign_words,
    all_slogan_shops,
    primary_trade_noun,
    specialties_for_trade,
    vertical_for_trade,
)
LIST_BUILDS_DIR = SCRIPT_DIR.parent / "list-builds" / "out"
KEEP_IN_NAMES = {".gitkeep"}
SIDECAR_TOKENS = ("pipeline", "instantly", "quarantine")

GENERIC_FIRST_NAMES = {
    "admin", "info", "contact", "sales", "office", "team", "service", "services",
    "enquiries", "enquiry", "manager", "support", "help", "there", "owner",
    "member", "staff", "technician", "technicians",
    "reception", "director", "accounts", "billing", "scheduler", "administration",
    "financial", "mr", "mrs", "ms", "dr", "solutions", "contractor", "contractors",
    "group", "australia", "australian", "aust", "role", "hello", "jobs", "accounts",
    "experienced", "founder", "cofounder", "co-founder", "rope", "lead", "principal",
    "estimator", "supervisor", "consultant", "operator", "specialist", "specialists",
    "your", "our", "we", "must", "thank", "thanks", "built", "explore", "project",
    "commercial", "network", "with", "ideal", "the", "this", "that", "proudly",
    # Page-copy junk the site-extract name regex pulls off nav, footer, and
    # slogan lines (observed 2026-09-07 Melbourne plumber run).
    "hi", "areas", "builders", "corporations", "dear", "excellent", "expert",
    "frequently", "had", "landlord", "modern", "phone", "privacy", "read",
    "settlement", "should", "skip", "start", "testimonials", "their", "can",
}

COMMON_GIVEN_NAMES = {
    "adam", "alan", "allan", "allen", "andrew", "andy", "anthony", "ben", "bill",
    "bob", "brad", "brett", "brian", "brinton", "bruce", "bryce", "callum", "cameron", "charlie", "chris",
    "colin", "craig", "dale", "damian", "damien", "dan", "daniel", "darren",
    "dave", "david", "dean", "dennis", "derek", "domenic", "doug", "edward",
    "eric", "frank", "gary", "geoff", "geoffrey", "george", "glen", "glenn",
    "graeme", "graham", "grant", "greg", "guy", "harry", "howie", "ian", "isaac",
    "jack", "jacob", "jake", "james", "jamie", "jared", "jason", "jeff", "jeremy",
    "jye",
    "jesse", "jim", "joe", "joel", "john", "jonathan", "josh", "justin", "keith",
    "ken", "kevin", "kirill", "kyle", "lance", "lee", "les", "liam", "luke",
    "malcolm", "manny", "marcus", "mark", "martin", "mason", "matt", "matthew",
    "michael", "mick", "mike", "mitchell", "mustapha", "nathan", "neil", "neill",
    "nick", "nigel", "noel", "norman", "onur", "oscar", "patrick", "paul", "peter",
    "phil", "philip", "rajesh", "ray", "raymond", "rachel", "reece", "richard",
    "rob", "robert", "rodney", "roger", "roland", "ron", "ross", "russell", "ryan",
    "salim", "sam", "scott", "sean", "sergio", "shalev", "shane", "shaun", "simon",
    "clay", "grace", "mathew", "ryley", "tristian", "tristan", "yu",
    "stefan", "stephen", "steve", "steven", "stuart", "ted", "terry", "tim",
    "timothy", "toby", "todd", "tom", "tony", "travis", "trent", "trevor", "troy",
    "victor", "vince", "vincent", "wael", "wade", "warren", "wayne", "xavier",
}

SINGLE_ADJECTIVES = {
    "super", "mighty", "pure", "absolute", "simple", "expert", "active",
    "total", "premier", "prime", "direct", "rapid", "clever", "perfect", "yes",
}

METRO_CITIES = {
    "sydney", "melbourne", "brisbane", "perth", "adelaide", "darwin", "hobart",
    "canberra", "gold coast", "newcastle", "wollongong", "geelong", "new south wales",
    "nsw", "victoria", "vic", "queensland", "qld", "western australia", "wa",
    "south australia", "sa", "northern territory", "nt", "tasmania", "tas",
    "australian capital territory", "act", "greater sydney", "greater melbourne",
}

LEGAL_SUFFIXES = [
    r"\(N\.S\.W\.\)", r"\(NSW\)", r"\(VIC\)", r"\(QLD\)", r"\(WA\)", r"\(SA\)",
    r"\(NT\)", r"\(TAS\)", r"\(ACT\)",
    r"\bPty\.?\s+Ltd\.?\b", r"\bPty\.?\b", r"\bLtd\.?\b", r"\bP/L\b", r"\bP\.L\.\b",
    r"\bEnterprises?\b", r"\bIncorporated\b", r"\bInc\.?\b",
]

GEO_SUFFIXES = [
    r"Northern Beaches", r"Eastern Suburbs", r"Hills District",
    r"Sydney", r"Melbourne", r"Brisbane", r"Perth", r"Adelaide",
    r"Darwin", r"Hobart", r"Canberra", r"\bNT\b", r"\bNSW\b", r"\bVIC\b",
    r"\bQLD\b", r"\bWA\b", r"\bSA\b",
]

ENGINE_TAIL_PHRASES = [
    r"Services",
    r"Solutions",
    r"Group",
    r"Specialists",
    r"Contractors",
    r"Professionals",
    r"\bPlus\b",
    r"\bPro\b",
    r"\bCo\b",
    r"\bIn\b",
]

PAID_DEMAND = (
    ("hipages", ("hipages", "hi pages")),
    ("google ads", ("google ads", "google adwords", "google ad ", "pay per click", "ppc ads")),
    ("meta ads", ("meta ads", "facebook ads", "instagram ads")),
)

PLACEHOLDER_FIRST = GENERIC_FIRST_NAMES | {"frm", "team"}
CORP_AS_NAME = {"veolia"}
GENERIC_EMAIL_LOCALS = {
    "admin", "info", "contact", "sales", "office", "team", "service", "services",
    "enquiries", "enquiry", "manager", "support", "help", "hello", "jobs",
    "accounts", "billing", "reception", "bookings", "booking", "privacy",
    "mail", "email", "webmaster", "noreply", "no-reply", "accounts",
}
GENERIC_LONE_LEFTOVERS = {
    "the", "a", "all", "emergency", "simply", "know", "estimating",
    "solutions", "services", "group", "plus", "hot", "water", "and", "of", "your",
    "serious", "clean", "repairs",
}


@lru_cache(maxsize=1)
def _placeholder_first() -> frozenset[str]:
    return frozenset(PLACEHOLDER_FIRST | set(all_shop_sign_words()))


@lru_cache(maxsize=1)
def _lone_leftovers() -> frozenset[str]:
    return frozenset(GENERIC_LONE_LEFTOVERS | set(all_shop_sign_words()))


@lru_cache(maxsize=1)
def _compiled_aliases() -> tuple[tuple[re.Pattern[str], str], ...]:
    return tuple((re.compile(pat, re.I), repl) for pat, repl in all_company_aliases())


@lru_cache(maxsize=1)
def _tail_phrases() -> tuple[str, ...]:
    phrases = list(ENGINE_TAIL_PHRASES)
    phrases.extend(re.escape(p) for p in all_shop_sign_phrases())
    return tuple(sorted(phrases, key=len, reverse=True))

# Waterfall constants
TIER_PAID = "tier_1_paid_demand"
TIER_SPECIALTY = "tier_2_specialty"
TIER_FALLBACK = "tier_3_fallback"

PICKUP_BANNED = (
    "who picks up",
    "who handles calls",
    "who handles incoming",
    "leads get booked when the team's on site",
    "no diary",
    "empty diary",
    "another shop got paid",
    "showed jobs, not more names",
    "the scoreboard is showed jobs",
    "that is same-week money",
    "closes at",
)

def parse_raw_data(row: dict) -> dict:
    view = enrich_row(row)
    raw = view.get("raw_data")
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def listing_blob(row: dict, raw: dict) -> str:
    parts = [
        pick(row, "hours_claim", "hours"),
        pick(row, "openingHoursToday.hours"),
        pick(row, "currentStatus"),
        pick(row, "paid_demand"),
        pick(row, "services"),
        pick(row, "specialty"),
        pick(row, "trade"),
        pick(row, "categoryName", "category_name"),
        pick(row, "categories"),
        pick(row, "business_name", "company"),
    ]
    if raw:
        parts.append(json.dumps(raw, default=str))
    return " ".join(p for p in parts if p).lower()


def detect_paid_demand(row: dict, raw: dict | None = None) -> str:
    del raw
    explicit = pick(row, "paid_demand").lower()
    if not explicit:
        return ""
    for label, keys in PAID_DEMAND:
        if any(key in explicit for key in keys):
            return label
    return ""


def has_paid_demand(row: dict, raw: dict | None = None) -> bool:
    return bool(detect_paid_demand(row, raw))


def _compact_name(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (text or "").lower())


def is_brand_mashed_as_person(cand: str, biz_name: str) -> bool:
    compact_cand = _compact_name(cand)
    compact_biz = _compact_name(biz_name)
    return bool(compact_cand) and len(compact_cand) >= 6 and compact_biz.startswith(compact_cand)


def first_name_from_email(email: str) -> str:
    if not email or "@" not in email:
        return ""
    local = email.split("@", 1)[0].strip().lower()
    placeholders = _placeholder_first()
    if not local or local in GENERIC_EMAIL_LOCALS or local in placeholders:
        return ""
    tokens = [t for t in re.split(r"[._+\-]+", local) if t]
    if not tokens:
        return ""
    token = tokens[0]
    if token in placeholders or token in GENERIC_EMAIL_LOCALS:
        return ""
    if token in COMMON_GIVEN_NAMES:
        return token.capitalize()
    if local in COMMON_GIVEN_NAMES:
        return local.capitalize()
    return ""


def clean_first_name(row: dict, raw: dict, biz_name: str, campaign_trade: str = "") -> str:
    candidates = []
    placeholders = _placeholder_first()
    shop_tails = set(all_shop_sign_words()) | {"services", "contractors", "gas", "drainage"}
    if campaign_trade:
        shop_tails |= set(vertical_for_trade(campaign_trade).shop_sign_words)

    staffs = raw.get("staffs")
    if isinstance(staffs, list):
        ranked = []
        for staff in staffs:
            if not isinstance(staff, dict):
                continue
            name = (staff.get("name") or "").strip()
            role = (staff.get("role") or "").lower()
            rank = 2
            if any(tok in role for tok in ("owner", "director", "founder", "principal")):
                rank = 0
            elif any(tok in role for tok in ("scheduler", "admin", "accounts", "reception")):
                rank = 3
            ranked.append((rank, name))
        ranked.sort()
        candidates.extend(name for _, name in ranked if name)

    col = pick(row, "first_name", "firstName", "firstname")
    if col:
        candidates.append(col)

    for cand in candidates:
        if re.search(r"\b(pty\.?|ltd\.?|group|solutions|services|access|holdings|management|technicians|enterprises|family)\b", cand, re.I):
            continue
        token = cand.strip().split()[0].strip(" ,.-/")
        lowered = token.lower()
        if lowered in placeholders or lowered in CORP_AS_NAME:
            continue
        if is_brand_mashed_as_person(cand, biz_name):
            continue
        biz_tokens = re.findall(r"[A-Za-z0-9]+", biz_name or "")
        if biz_tokens and lowered == biz_tokens[0].lower():
            continue
        if (
            biz_tokens
            and lowered not in COMMON_GIVEN_NAMES
            and biz_tokens[0].lower().startswith(lowered)
            and len(biz_tokens[0]) > len(token)
        ):
            continue
        if lowered.endswith("team") or " team" in cand.lower():
            continue
        if lowered.endswith(("ians", "ites", "folk")):
            continue
        if not token.isalpha() or len(token) < 2:
            continue
        return token.capitalize()

    # An address or shop sign does not establish the recipient's person name.
    return ""


def extract_business_name(row: dict, raw: dict) -> str:
    name = pick(row, "business_name", "company", "company_name", "title")
    if name:
        return name
    for key in ("business_name", "store_name", "company"):
        val = raw.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    maps_url = pick(row, "maps_url")
    if "maps/place/" in maps_url:
        match = re.search(r"/maps/place/([^/@]+)", maps_url)
        if match:
            extracted = unquote_plus(match.group(1)).strip()
            if extracted:
                return extracted
    website = pick(row, "website", "website_url", "url")
    if website:
        host = urlparse(website if "://" in website else f"https://{website}").hostname or ""
        host = host.removeprefix("www.")
        root = host.split(".")[0] if host else ""
        if root:
            return root.replace("-", " ").title()
    return ""


def extract_suburb(row: dict, raw: dict, campaign_city: str) -> str:
    metro = METRO_CITIES | {campaign_city.lower()}
    suburb = pick(row, "suburb")
    city = pick(row, "city")
    raw_city = (raw.get("city") or "").strip() if raw else ""

    for cand in (suburb, city, raw_city):
        if cand and cand.lower() not in metro:
            return cand

    address = pick(row, "address")
    if address:
        parts = [p.strip() for p in address.split(",") if p.strip()]
        for i, part in enumerate(parts):
            if re.match(r"^\d{4}$", part) or part.lower() in metro | {"au", "australia"}:
                continue
            nxt = parts[i + 1].lower() if i + 1 < len(parts) else ""
            if nxt in metro or re.match(r"^\d{4}$", parts[i + 1] if i + 1 < len(parts) else ""):
                if part.lower() not in metro:
                    return part

    for cand in (suburb, city, raw_city, campaign_city.title()):
        if cand:
            return cand
    return campaign_city.title()


def _trim_glue(name: str) -> str:
    name = re.sub(r"[\s,&\-\|\./]+$", "", name).strip()
    name = re.sub(r"^[\s,&\-\|\./]+", "", name).strip()
    name = re.sub(r"(?:\s+(?:and|&))+$", "", name, flags=re.IGNORECASE).strip()
    return re.sub(r"\s+", " ", name).strip()


def _strip_generic_tails(name: str) -> str:
    changed = True
    lone = _lone_leftovers()
    while changed:
        changed = False
        for phrase in _tail_phrases():
            if phrase == r"\bCo\b" and re.search(r"(?:&|and)\s+Co\s*$", name, re.I):
                continue
            cand = re.sub(rf"(?:\s+|&|and)*{phrase}\s*$", "", name, flags=re.IGNORECASE)
            cand = _trim_glue(cand)
            if cand == name or len(cand) < 2 or cand.lower() in {"the", "a", "all", "emergency"}:
                continue
            leftover = cand.split()
            if leftover and leftover[-1].lower() in {"your", "the", "a", "and", "of"}:
                continue
            if len(leftover) == 1 and leftover[0].lower() in lone:
                continue
            name = cand
            changed = True
            break
        if name.endswith(" Air") and len(name.split()) >= 3:
            name = _trim_glue(name[:-4])
            changed = True
    return name


def _strip_shop_sign_if_long(name: str) -> str:
    words = name.split()
    tails = all_shop_sign_words()
    while len(words) > 3 and words[-1].lower() in tails:
        words = words[:-1]
        name = _trim_glue(" ".join(words))
        words = name.split()
    return name


def casualise_company(biz_name: str, suburb: str = "", campaign_trade: str = "") -> str:
    original = re.sub(r"[^\x00-\x7F]+", "", (biz_name or "")).strip()
    if not original:
        return ""

    for pattern, alias in _compiled_aliases():
        if pattern.search(original):
            return alias

    name = re.split(r"\s+[\|\-–—]\s+", original)[0].strip()
    name = re.sub(r"\s*\([^)]*\)", "", name)
    name = re.sub(r",(?=\S)", ", ", name)

    for suffix in LEGAL_SUFFIXES:
        name = re.sub(suffix, "", name, flags=re.IGNORECASE).strip()

    for geo in GEO_SUFFIXES:
        name = re.sub(rf"(?:^|\s){geo}\s*$", "", name, flags=re.IGNORECASE).strip()
    if suburb and len(suburb) > 3:
        name = re.sub(rf"\b{re.escape(suburb)}\s*$", "", name, flags=re.IGNORECASE).strip()

    name = _strip_generic_tails(name)
    name = _strip_shop_sign_if_long(name)
    name = _strip_generic_tails(name)
    name = _trim_glue(name)

    if name.isupper() and " " in name and "." not in name:
        name = name.title()
    elif name.isupper() and len(name) > 5 and "." not in name:
        name = name.title()

    shop_words = set(all_shop_sign_words())
    default_noun = ""
    if campaign_trade:
        default_noun = primary_trade_noun(campaign_trade)
        shop_words |= set(vertical_for_trade(campaign_trade).shop_sign_words)

    if name.lower() in SINGLE_ADJECTIVES and default_noun:
        name = f"{name.title()} {default_noun.title()}"

    words = name.split()
    if (
        len(words) == 2
        and words[0].lower() in SINGLE_ADJECTIVES
        and words[1].lower() in shop_words
        and default_noun
    ):
        name = f"{words[0].title()} {default_noun.title()}"

    empty_names = shop_words | {"serious", "clean"}
    if not name or len(name) < 2 or name.lower() in empty_names:
        stripped = re.sub(
            r"\bPty\.?\s+Ltd\.?\b|\bPty\.?\b|\bLtd\.?\b|\bP/L\b",
            "",
            original,
            flags=re.IGNORECASE,
        ).strip()
        name = stripped or original
    return name


def team_core(shop: str) -> str:
    words = (shop or "").split()
    if len(words) >= 2 and words[-1].lower() in all_shop_sign_words():
        return " ".join(words[:-1])
    return shop or ""


def is_person_company(
    biz_name: str,
    first_name: str,
    last_name: str,
    campaign_trade: str = "",
) -> bool:
    casual = casualise_company(biz_name, campaign_trade=campaign_trade)
    words = casual.split()
    if not words:
        return False
    if casual.lower() in all_slogan_shops():
        return True
    first_word = words[0].lower()
    given = first_word in COMMON_GIVEN_NAMES or (
        bool(first_name) and first_word == first_name.lower()
    )
    if not given:
        return False
    if len(words) == 1:
        return True
    if len(words) == 2:
        if last_name and words[1].lower() == last_name.lower():
            return True
        if words[1][0].isupper() and words[1].lower() not in SINGLE_ADJECTIVES:
            return True
    full = f"{first_name} {last_name}".strip().lower()
    return bool(full) and casual.lower() == full


def _phrase_forms(phrase: str) -> list[str]:
    p = (phrase or "").strip().lower()
    if not p:
        return []
    forms = {p, p.replace("-", " "), p.replace(" ", "-")}
    words = p.split()
    last = words[-1]
    if last.endswith("ies") and len(last) > 4:
        forms.add(" ".join(words[:-1] + [last[:-3] + "y"]).strip())
    elif last.endswith("s") and not last.endswith("ss") and len(last) > 3:
        forms.add(" ".join(words[:-1] + [last[:-1]]).strip())
    else:
        forms.add(" ".join(words[:-1] + [last + "s"]).strip())
    return [f for f in sorted(forms, key=len, reverse=True) if f]


# Maps / scraper stamps that should not be spoken verbatim in the opener.
SPECIALTY_SPOKEN = {
    "emergency locksmith service": "emergency lockouts",
    "emergency lockout": "emergency lockouts",
    "car keys": "car keys",
    "auto locksmith": "car keys",
    "lockout": "lockouts",
    "rekey": "rekeying",
    "lock rekeying": "rekeying",
    "switchboards": "switchboard upgrades",
    "fault finding": "fault calls",
    "ev charger": "EV chargers",
    "power outage": "power outages",
}
# These already read as the work, so "handles X work" is clunky.
SPECIALTY_SKIP_WORK = {
    "emergency lockouts",
    "car keys",
    "lockouts",
    "rekeying",
    "switchboard upgrades",
    "fault calls",
    "ev chargers",
    "power outages",
    "smoke alarms",
    "lighting",
    "rewiring",
}
SPECIALTY_SUBJECT = {
    "emergency lockouts": "emergency lockout",
    "lockouts": "lockout",
}


def spoken_specialty(label: str) -> str:
    key = (label or "").strip().lower()
    return SPECIALTY_SPOKEN.get(key, label)


def specialty_clause(spoken: str, suburb: str) -> str:
    if (spoken or "").strip().lower() in SPECIALTY_SKIP_WORK:
        return f"{spoken} across {suburb}."
    return f"{spoken} work across {suburb}."


def detect_specialty(blob: str, campaign_trade: str) -> str:
    text = (blob or "").lower()
    if not text:
        return ""
    for label in specialties_for_trade(campaign_trade):
        if any(form in text for form in _phrase_forms(label)):
            if label.lower() in {"aircon", "air con"}:
                return "air conditioning"
            return spoken_specialty(label)
    return ""


def _specialty_phrases(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"[;|,]", text or "") if p.strip()]


def detect_specialty_from_columns(row: dict, campaign_trade: str) -> str:
    """Site-extract specialty/services cells in shop order. Not the Maps blob.

    The order the shop lists its own work beats the vertical file's keyword
    order: first cell phrase that hits a vertical keyword wins.
    """
    labels = specialties_for_trade(campaign_trade)
    for cell in (pick(row, "specialty"), pick(row, "services")):
        for phrase in _specialty_phrases(cell):
            blob = phrase.lower()
            for label in labels:
                if any(form in blob for form in _phrase_forms(label)):
                    if label.lower() in {"aircon", "air con"}:
                        return "air conditioning"
                    return spoken_specialty(label)
    return ""


def detect_specialty_merged(row: dict, raw: dict | None, campaign_trade: str) -> str:
    """Column-first, then saved Compass facts, then the listing blob."""
    facts = row.get("lead_facts") or []
    if isinstance(facts, str):
        try:
            facts = json.loads(facts)
        except (ValueError, TypeError):
            facts = []
    saved = "; ".join(
        str(f.get("claim") or "") for f in facts
        if isinstance(f, dict) and f.get("kind") == "specialty"
    ) if isinstance(facts, list) else ""
    return detect_specialty_from_columns(row, campaign_trade) or detect_specialty_from_columns(
        {"specialty": saved}, campaign_trade
    ) or detect_specialty(
        listing_blob(row, raw or {}), campaign_trade
    )


def _you_or_company(is_person: bool, company: str, verb_you: str, verb_co: str, rest: str) -> str:
    if is_person:
        return f"Saw you {verb_you} {rest}"
    return f"Saw {company} {verb_co} {rest}"


def evaluate_waterfall(
    row: dict,
    raw: dict,
    company: str,
    is_person: bool,
    suburb: str,
    campaign_trade: str,
    campaign_city: str,
) -> dict:
    # Tier 1: Paid Demand (Hipages, Google Ads, Meta Ads)
    paid = detect_paid_demand(row, raw)
    if paid:
        tails = {
            "hipages": (
                "are on",
                "is on",
                f"Hipages around {suburb}.",
                "hipages jobs",
            ),
            "google ads": (
                "run",
                "runs",
                f"Google ads around {suburb}.",
                "google ads jobs",
            ),
            "meta ads": (
                "run",
                "runs",
                f"Meta ads around {suburb}.",
                "meta ads jobs",
            ),
        }
        verb_you, verb_co, rest, subject_bit = tails[paid]
        opener = _you_or_company(is_person, company, verb_you, verb_co, rest)
        subject = f"{suburb.lower()} {subject_bit}" if suburb else f"{company.lower()} {subject_bit}"
        return {"tier": TIER_PAID, "subject": subject, "opener": opener}

    # Tier 2: High-Margin Specialty (site-extract columns first, blob fallback)
    specialty = detect_specialty_merged(row, raw, campaign_trade)
    if specialty:
        opener = _you_or_company(
            is_person, company,
            "handle", "handles",
            specialty_clause(specialty, suburb),
        )
        subject_bit = SPECIALTY_SUBJECT.get(specialty.lower(), specialty.lower())
        subject = f"{suburb.lower()} {subject_bit} jobs" if suburb else f"{company.lower()} {subject_bit} jobs"
        return {"tier": TIER_SPECIALTY, "subject": subject, "opener": opener}

    noun = primary_trade_noun(campaign_trade) or campaign_trade
    place = suburb or campaign_city
    if is_person:
        opener = f"Saw you taking {noun} jobs in {place}."
    else:
        opener = f"Saw {company} taking {noun} jobs in {place}."
    subject = f"{place.lower()} {noun.lower()} jobs" if place else f"{(company or noun).lower()} jobs"
    return {"tier": TIER_FALLBACK, "subject": subject, "opener": opener}


def render_opener(first_name: str, sentence: str) -> str:
    if not sentence:
        return ""
    if first_name:
        rest = sentence
        if rest.startswith("Saw "):
            rest = "saw " + rest[4:]
        return f"Hi {first_name}, {rest}"
    return sentence


def is_sendable_email(row: dict) -> bool:
    if outreach_exclusion(row):
        return False
    email = pick(row, "verified_email", "primary_email", "email", "work_email")
    if not email or "@" not in email:
        return False
    return email_verification_eligible(row)


def spec_violations(
    result: dict,
    source_row: dict | None = None,
    raw: dict | None = None,
    campaign_trade: str = "",
) -> list[str]:
    """Return spec breaches."""
    bad = []
    first = (result.get("firstName") or "").strip()
    subject = result.get("subject") or ""
    opener = result.get("opener") or ""
    tier = result.get("signal_tier") or result.get("tier") or ""

    if first.lower() in _placeholder_first() or first.lower().endswith(" team") or " team" in first.lower():
        bad.append("placeholder_firstname")
    if opener:
        if first and not opener.startswith(f"Hi {first}, saw "):
            bad.append("missing_greeting")
        if not first and opener.startswith("Hi "):
            bad.append("greeting_without_firstname")
        if not first and not opener.startswith("Saw"):
            bad.append("opener_must_start_saw")
        if first and "\n" in opener:
            bad.append("greeting_not_one_line")
        if opener[-1] not in ".?":
            bad.append("opener_punctuation")
    if re.search(r"Saw  ", opener):
        bad.append("double_space")
    if re.search(r"\{[a-zA-Z_]+\}", opener + subject):
        bad.append("unrendered_tag")
    if subject != subject.lower():
        bad.append("subject_not_lowercase")
    if any(phrase in opener.lower() for phrase in PICKUP_BANNED):
        bad.append("pickup_language")
    if source_row is not None:
        raw = raw if raw is not None else parse_raw_data(source_row)
        if has_paid_demand(source_row, raw) and tier != TIER_PAID:
            bad.append("paid_demand_tier_skipped")
        if campaign_trade:
            specialty = detect_specialty_merged(source_row, raw, campaign_trade)
            if specialty and not has_paid_demand(source_row, raw) and tier != TIER_SPECIALTY:
                bad.append("specialty_tier_skipped")
    return bad


def process_row(row: dict, campaign_trade: str, campaign_city: str) -> dict:
    raw = parse_raw_data(row)
    biz = extract_business_name(row, raw)
    suburb = extract_suburb(row, raw, campaign_city)
    first = clean_first_name(row, raw, biz, campaign_trade)
    company = casualise_company(biz, suburb, campaign_trade)
    person = is_person_company(
        biz, first, pick(row, "last_name", "lastName", "Last Name"), campaign_trade,
    )
    if not company:
        company = biz

    signal = evaluate_waterfall(
        row, raw, company, person, suburb, campaign_trade, campaign_city,
    )
    opener = render_opener(first, signal["opener"]) if signal["opener"] else ""
    service = detect_specialty_merged(row, raw, campaign_trade)
    out = {
        **row,
        "firstName": first,
        "subject": signal["subject"],
        "opener": opener,
        "Opener": opener,
        "companyShort": company,
        "service": service,
        "signal_tier": signal["tier"],
        # Resolved suburb as spoken in the opener, so the upload CSV's
        # {{suburb}} merge cannot drift from the opener text.
        "suburb": suburb,
    }
    if not pick(out, "business_name") and biz:
        out["business_name"] = biz

    reason = ""
    if not signal["opener"]:
        reason = "no_opener_signal"
    elif not company or not suburb:
        reason = "Missing required merge tags"
    violations = spec_violations(out, row, raw, campaign_trade)
    fatal = [v for v in violations if v not in {"placeholder_firstname"}]
    if fatal:
        reason = reason or "; ".join(fatal)
    if not is_sendable_email(row):
        reason = reason or "email_or_verification_ineligible_or_previously_contacted"
    sendable = not reason
    out["sendable"] = sendable
    out["verification_reason"] = reason
    return out


def resolve_input(trade: str, city: str, month: str, explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit)
        if not path.exists():
            raise SystemExit(f"Input not found: {path}")
        return path
    folder = LIST_BUILDS_DIR / trade
    preferred = folder / f"{trade}-{city}-sendable-{month}.csv"
    if preferred.exists():
        return preferred
    fallback = folder / f"{trade}-{city}-{month}.csv"
    if fallback.exists():
        return fallback
    raise SystemExit(
        f"No list-builds CSV at {preferred} or {fallback}. Pass --input."
    )


def process_csv(input_path: Path, trade: str, city: str, out_date: str) -> tuple[Path, Path, int, int]:
    with input_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        source_rows = list(reader)
        source_fields = list(reader.fieldnames or [])
    require_verified_email_column(source_fields, job="generate_openers.py")

    sendable, unsendable = [], []
    seen_emails = set()
    for row in source_rows:
        out = process_row(row, trade, city)
        email = pick(row, "verified_email").lower()
        if out["sendable"] and email in seen_emails:
            out["sendable"] = False
            out["verification_reason"] = "duplicate_email"
        if out["sendable"]:
            seen_emails.add(email)
        bucket = sendable if out["sendable"] else unsendable
        bucket.append(out)

    out_dir = SCRIPT_DIR / "out" / trade
    out_dir.mkdir(parents=True, exist_ok=True)
    send_path = out_dir / f"{trade}-{city}-sendable-{out_date}.csv"
    unsend_path = out_dir / f"{trade}-{city}-unsendable-{out_date}.csv"

    def is_raw_col(name: str) -> bool:
        return fold_header(name) == "raw_data"

    lead_keys = [k for k in source_fields if not is_raw_col(k)]
    raw_keys = [k for k in source_fields if is_raw_col(k)]
    front = ["firstName", "subject", "opener", "Opener", "companyShort", "service", "signal_tier", "suburb"]
    send_fields = front + [
        k for k in lead_keys if k not in set(front)
    ] + raw_keys
    unsend_fields = ["firstName", "subject", "opener", "Opener", "companyShort", "service", "signal_tier", "verification_reason"] + [
        k for k in lead_keys if k not in {"firstName", "subject", "opener", "Opener", "companyShort", "service", "signal_tier", "verification_reason"}
    ] + raw_keys

    with send_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=send_fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(sendable)
    with unsend_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=unsend_fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(unsendable)
    return send_path, unsend_path, len(sendable), len(unsendable)


def _is_sidecar(path: Path) -> bool:
    name = path.name.lower()
    return any(token in name for token in SIDECAR_TOKENS)


def cleanup_temps(trade: str, city: str, out_date: str) -> list[Path]:
    """Retain source rows and receipts; retention is explicit, never global cleanup."""
    return []


def render_preparation_ticket(ticket: dict) -> list[dict]:
    """Render Compass's frozen recipe from quoted facts, with no legacy fallback.

    This is the production engine's preparation entry point. Compass independently
    checks every substitution before accepting the immutable worker output.
    """
    from datetime import datetime, timezone, timedelta

    def fact(row: dict, kind: str) -> str:
        values = set()
        for evidence in row.get("evidence", []):
            if evidence.get("kind") != kind:
                continue
            value = evidence.get("value", "").strip()
            quote = evidence.get("quote", "").strip()
            url = urlparse(evidence.get("url", ""))
            try:
                observed = datetime.fromisoformat(evidence.get("observed_at", "").replace("Z", "+00:00"))
                valid_time = observed.tzinfo is not None and observed <= datetime.now(timezone.utc) + timedelta(seconds=60)
            except (ValueError, TypeError):
                valid_time = False
            if not (value and quote and value.lower() in quote.lower() and url.scheme in {"http", "https"} and url.hostname and not url.username and not url.password and valid_time):
                return ""
            values.add(value)
        return next(iter(values)) if len(values) == 1 else ""

    def merge(template: str, values: dict, double: bool = True) -> str:
        pattern = r"\{\{\s*(\w+)\s*\}\}" if double else r"\{(\w+)\}"
        def replace(match):
            value = values.get(match.group(1), "")
            if not value.strip():
                raise ValueError("blank_or_unknown_variable:" + match.group(1))
            return value
        result = re.sub(pattern, replace, template)
        if re.search(r"[{}]", result) or re.search(r"\b(?:Hi|Hey|Hello)\s*[,!]", result, re.I):
            raise ValueError("invalid_render")
        return result

    context = ticket["context"]
    recipe = context["recipe"]
    outputs = []
    for row in ticket["candidates"]:
        try:
            facts = {"company": row["company"], "service": fact(row, "service"), "service_area": fact(row, "service_area")}
            for evidence in row.get("evidence", []):
                kind = evidence.get("kind", "")
                if re.fullmatch(r"[a-z][a-z0-9_]*", kind) and kind not in {"company", "service", "service_area"}:
                    facts[kind] = fact(row, kind)
            if recipe.get("mode") == "evidence_draft":
                draft = row.get("draft", {})
                subject, opener = draft.get("subject", ""), draft.get("opener", "")
                kinds = draft.get("evidence_kinds", [])
                if not subject.strip() or not opener.strip() or len(subject)>100 or len(opener)>500 or re.search(r"[{}]|^\s*(re:|fwd:)", subject, re.I) or re.search(r"[{}]", opener):
                    raise ValueError("invalid_evidence_draft")
                if "service" not in kinds or any(not fact(row, kind) for kind in kinds):
                    raise ValueError("unsupported_evidence_draft")
                values = {"email": row["email"].strip().lower(), "first_name": "", "company_name": row["company"],
                          "subject": subject, "opener": opener, "personalization": opener}
            else:
                rule = next((r for r in recipe.get("rules", []) if fact(row, r["field"]) and (not r.get("contains", "").strip() or r["contains"].strip().lower() in fact(row, r["field"]).lower())), None)
                facts["signal"] = fact(row, rule["field"]) if rule else ""
                person = fact(row, "person_name").split()
                first_name = person[0] if person and recipe.get("include_name") is not False else ""
                opener = merge(rule["opener"] if rule else recipe["opener"], facts, False)
                if first_name:
                    opener = f"Hi {first_name}, " + opener[0].lower() + opener[1:]
                values = {"email": row["email"].strip().lower(), "first_name": first_name, "firstName": first_name,
                          "company_name": row["company"], "companyName": row["company"], "companyShort": row["company"],
                          "service": facts["service"], "suburb": facts["service_area"], "city": "Sydney",
                          "subject": merge((rule.get("subject", "").strip() if rule else "") or recipe["subject"], facts, False).lower(), "opener": opener, "Opener": opener, "personalization": opener}
                if "rules" in recipe:
                    values.update(signal_id=rule["id"] if rule else "fallback", signal_label=rule["label"] if rule else "Factual fallback", signal_value=facts["signal"])
            merges = dict(values, unsubscribe="[Unsubscribe]")
            steps = [{"subject": merge(step["subject"], merges),
                      "body": merge("\n\n".join(slot["body"].strip() for slot in step["slots"] if slot["key"] != "subject" and slot["body"].strip()), merges)}
                     for step in context["sequence"]["steps"]]
            outputs.append({"candidate_id": row["id"], "values": values, "steps": steps})
        except (ValueError, KeyError, TypeError, IndexError):
            # Compass retains and labels this candidate; rendering never drops it.
            continue
    return outputs


def main(argv: list[str] | None = None) -> int:
    today = date.today().strftime("%Y%m%d")
    parser = argparse.ArgumentParser(description="Generate Signal Waterfall openers.")
    parser.add_argument("--trade", required=True, help="plumber, hvac, electrical, locksmith, roofing, pest")
    parser.add_argument("--city", required=True, help="sydney, perth, darwin, melbourne")
    parser.add_argument("--input", help="list-builds CSV (defaults to sendable path)")
    parser.add_argument("--date", default=today, help="output date YYYYMMDD")
    parser.add_argument("--month", help="input month YYYYMM (default: first 6 of --date)")
    args = parser.parse_args(argv)

    trade = args.trade.lower().strip()
    city = args.city.lower().strip()
    month = args.month or args.date[:6]
    input_path = resolve_input(trade, city, month, args.input)
    send_path, unsend_path, n_send, n_unsend = process_csv(input_path, trade, city, args.date)
    print(f"Sendable: {n_send} -> {send_path}")
    print(f"Unsendable: {n_unsend} -> {unsend_path}")
    cleanup_temps(trade, city, args.date)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
