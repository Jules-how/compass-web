#!/usr/bin/env python3
"""Job gate for the current Compass offer.

Resolves the next Compass cell, checks this campaign's cohort inventory, and
prints the job: copy pointer, Instantly preset, and either the Vortex payload
(scrape) or the cohort pull URL (refill). Stdout is the job. No ticket files.

  python3 factory_job.py                          # brief morningWave next slot
  python3 factory_job.py --trade electrical --city perth
  python3 factory_job.py --campaign campaign-au-electrical-perth-2026-09
  python3 factory_job.py --json [/tmp/job.json]   # also dump the payload to /tmp

Exit codes: 0 scrape · 2 refill (skip Vortex) · 3 no next cell / need Jules ·
4 usage, config, or Compass HTTP error · 5 review existing inventory first.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from vertical_spec import maps_terms_for_trade, vertical_for_trade

OS_ROOT = SCRIPT_DIR.parent
DEFAULT_BASE_URL = "https://compass-web-eosin.vercel.app"
ENV_FILE = OS_ROOT / "compass-web" / ".env.local"

EXIT_SCRAPE = 0
EXIT_REFILL = 2
EXIT_NEED_JULES = 3
EXIT_ERROR = 4
EXIT_REVIEW_INVENTORY = 5
CURRENT_OFFER = "installation-booking"

# city -> (display name, state, IANA timezone)
CITIES = {
    "sydney": ("Sydney", "New South Wales", "Australia/Sydney"),
    "melbourne": ("Melbourne", "Victoria", "Australia/Melbourne"),
    "brisbane": ("Brisbane", "Queensland", "Australia/Brisbane"),
    "gold coast": ("Gold Coast", "Queensland", "Australia/Brisbane"),
    "perth": ("Perth", "Western Australia", "Australia/Perth"),
    "adelaide": ("Adelaide", "South Australia", "Australia/Adelaide"),
    "darwin": ("Darwin", "Northern Territory", "Australia/Darwin"),
    "hobart": ("Hobart", "Tasmania", "Australia/Hobart"),
    "canberra": ("Canberra", "Australian Capital Territory", "Australia/Sydney"),
    "newcastle": ("Newcastle", "New South Wales", "Australia/Sydney"),
    "wollongong": ("Wollongong", "New South Wales", "Australia/Sydney"),
    "geelong": ("Geelong", "Victoria", "Australia/Melbourne"),
}

# Two Rocks to Mandurah, coast to Mundaring. Named `Greater Perth` geocodes as
# a 4.8 km CBD polygon on vortex_data/google-maps, so Perth runs on GeoJSON.
PERTH_GEOPOLYGON = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {"name": "Greater Perth metro (Two Rocks to Mandurah, coast to Mundaring)"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [115.55, -31.48],
                        [116.20, -31.48],
                        [116.20, -32.56],
                        [115.55, -32.56],
                        [115.55, -31.48],
                    ]
                ],
            },
        }
    ],
}

VORTEX_BASE = {
    "maxCrawledPlacesPerSearch": 2000,
    "languages": ["en"],
    "geoStrictMatch": False,
    "keepUnverifiedLocations": True,
    "skipClosedPlaces": True,
    "skipPlacesNotMatchingSearch": True,
    "extractContactsFromWebsite": False,
    "maxReviewsPerPlace": 0,
}

REFILL_PATH = (
    "/api/agent/leads?view=rows&columns=cohort"
    "&pipeline_campaign_id={campaign_id}"
    "&outbound_status=uncontacted&completeness=has_email&bucket=leads&limit=200"
)


class CompassError(Exception):
    pass


def load_config() -> tuple[str, str]:
    base = (os.environ.get("COMPASS_BASE_URL") or "").strip().rstrip("/")
    secret = (os.environ.get("COMPASS_AGENT_SECRET") or "").strip()
    if (not base or not secret) and ENV_FILE.is_file():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if not sep:
                continue
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key == "COMPASS_BASE_URL" and not base:
                base = value.rstrip("/")
            elif key == "COMPASS_AGENT_SECRET" and not secret:
                secret = value
    if not base:
        base = DEFAULT_BASE_URL
    if not secret:
        raise CompassError(
            "COMPASS_AGENT_SECRET not in env or compass-web/.env.local"
        )
    return base, secret


class CompassClient:
    """Thin GET wrapper. Tests substitute a fake with the same .get(path)."""

    def __init__(self, base_url: str, secret: str):
        self.base_url = base_url.rstrip("/")
        self.secret = secret

    def get(self, path: str) -> dict:
        url = f"{self.base_url}{path}"
        headers = {"Authorization": f"Bearer {self.secret}"}
        if path.split("?", 1)[0] == "/api/agent/brief":
            headers["x-compass-fresh"] = "1"
        req = urllib.request.Request(
            url, headers=headers
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise CompassError(f"GET {path} -> HTTP {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise CompassError(f"GET {path} failed: {exc}") from exc
        if isinstance(body, dict) and body.get("ok") is False:
            raise CompassError(f"GET {path} -> {body.get('error') or 'not ok'}")
        if isinstance(body, dict) and body.get("error"):
            raise CompassError(f"GET {path} -> {body['error']}")
        return body


def first_tag(tags, what: str) -> str:
    if isinstance(tags, list):
        for tag in tags:
            text = str(tag).strip()
            if text:
                return text
    return ""


def vortex_payload(trade: str, city: str) -> tuple[dict, list[str]]:
    """Maps payload for this cell. City in locationQueries, never in the term.
    Perth swaps the named location for the baked customGeolocation polygon."""
    warnings: list[str] = []
    terms = maps_terms_for_trade(trade)
    if not terms:
        raise CompassError(
            f"vertical file for --trade {trade} has no Maps search terms bullet"
        )
    payload = dict(VORTEX_BASE)
    payload["searchStringsArray"] = list(terms)
    key = city.strip().lower()
    if key == "perth":
        payload["customGeolocation"] = PERTH_GEOPOLYGON
    else:
        entry = CITIES.get(key)
        if entry:
            name, state, _tz = entry
            payload["locationQueries"] = [f"Greater {name}, {state}, Australia"]
        else:
            payload["locationQueries"] = [f"Greater {city.strip().title()}, Australia"]
            warnings.append(
                f"{city} is not in the baked city map; confirm the state in locationQueries"
            )
    return payload, warnings


def campaign_name_preset(city_display: str, trade: str, n, weekday: str) -> str:
    trade_label = "HVAC" if trade.lower() == "hvac" else trade.strip().title()
    return f"{city_display} {trade_label} | fill | {n} | {weekday}"


def resolve_from_brief(client) -> tuple[str, dict | None]:
    """Default job: the morningWave next slot. Proposed next wins while the
    brief is unaccepted; otherwise the active (last accepted) next."""
    body = client.get("/api/agent/brief")
    brief = body.get("brief") or {}
    wave = brief.get("morningWave") or None
    if not wave:
        return "", None
    status = wave.get("briefStatus")
    proposed = wave.get("proposedNext") or []
    active = wave.get("activeNext") or []
    pick = None
    if status == "proposed" and proposed:
        pick = proposed[0]
    elif active:
        pick = active[0]
    elif proposed:
        pick = proposed[0]
    if not pick:
        return "", wave
    return str(pick.get("campaignId") or ""), wave


def resolve_from_desk(client, trade: str, city: str) -> str:
    spec = vertical_for_trade(trade)  # SystemExit on unknown trade flag
    flags = {spec.trade, *spec.trade_flags}
    desk = client.get("/api/agent/offers/desk")
    matches = []
    for cell in desk.get("cells") or []:
        vertical = str(cell.get("vertical") or "").strip().lower()
        cell_city = str(cell.get("city") or "").strip().lower()
        if vertical in flags and cell_city == city.strip().lower():
            matches.append(cell)
    if not matches:
        raise LookupError(
            f"no Compass desk cell for {trade} x {city}; Jules creates it with "
            "POST /api/agent/offers/cells"
        )
    current = [c for c in matches if c.get("offerKey") == CURRENT_OFFER]
    if not current:
        raise LookupError("No current-offer cell. Historical offers are not a fallback.")
    cell = current[0]
    campaigns = [c for c in cell.get("campaigns") or [] if c.get("id") and c.get("status") not in {"cancelled", "archived", "completed"}]
    if not campaigns:
        raise LookupError(
            f"desk cell {cell.get('key')} has no campaign; Jules binds one on the Compass desk"
        )
    return str(campaigns[0]["id"])


def build_job(client, campaign_id: str, wave: dict | None) -> dict:
    copy = client.get(f"/api/agent/outbound/campaigns/{campaign_id}/copy?full=1")
    camp = copy.get("campaign") or {}
    if not camp.get("id"):
        raise LookupError(f"Compass campaign not found: {campaign_id}")

    if camp.get("offer_key") != CURRENT_OFFER:
        raise LookupError("This runner prepares the current installation-booking offer; do not reuse a historical campaign.")
    desk = client.get("/api/agent/offers/desk")
    active_offers = [entry.get("offer", {}) for status in ("live", "testing") for entry in desk.get(status, [])]
    offer = next((row for row in active_offers if row.get("offer_key") == CURRENT_OFFER and not row.get("archived")), None)
    if not offer:
        raise LookupError("Current offer is missing or retired in Compass.")
    relevance = (offer.get("lock") or {}).get("relevance") or []
    if not relevance or not any(f.get("required") for f in relevance):
        raise LookupError("Current offer needs source-backed required targeting facts in Compass.")
    if not (camp.get("sequence_draft") or {}).get("steps"):
        raise LookupError("Current campaign needs its own sequence draft in Compass; there is no legacy-copy fallback.")

    trade = first_tag(camp.get("vertical_tags"), "vertical").lower()
    city = first_tag(camp.get("location_tags"), "city")
    if not trade or not city:
        raise LookupError(
            f"campaign {campaign_id} is missing vertical_tags / location_tags; "
            "city lives in location_tags. Tag the cell on the Compass desk."
        )
    vertical_for_trade(trade)  # unknown trade on the cell is a desk data error

    count_path = REFILL_PATH.format(
        campaign_id=urllib.parse.quote(str(campaign_id), safe="")
    ).replace("limit=200", "limit=1")
    inventory = client.get(count_path)
    def checked_total(result):
        value = result.get("total")
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise CompassError("Inventory count unavailable; do not infer zero or pay for a scrape.")
        return value
    cohort = checked_total(inventory)
    candidate_path = "/api/agent/leads?view=rows&columns=cohort&vertical=" + urllib.parse.quote(trade, safe="") + "&pipeline_campaign_id=none&outbound_status=uncontacted&bucket=leads&limit=1"
    candidates = checked_total(client.get(candidate_path)) if not cohort else 0

    remaining = None
    for card in (wave or {}).get("sending") or []:
        if str(card.get("campaignId") or "") == str(campaign_id):
            remaining = card.get("remaining")
            break

    target = camp.get("sample_size_target")
    refill = cohort > 0
    decision = "refill" if refill else ("review_inventory" if candidates else "scrape")
    reason = (
        f"{cohort} uncontacted-with-email rows already on this cell; Maps stays off."
        if refill
        else (f"{candidates} unassigned uncontacted trade records exist; research geography, contact evidence and exclusions before Maps." if candidates else "No cohort or unassigned trade inventory found. Confirm paid actor access and remaining budget before considering Maps.")
    )

    entry = CITIES.get(city.strip().lower())
    city_display = entry[0] if entry else city.strip().title()
    timezone = entry[2] if entry else None
    warnings: list[str] = []
    if not entry:
        warnings.append(f"{city} is not in the baked city map; confirm timezone")

    payload = None
    if decision == "scrape":
        payload, payload_warnings = vortex_payload(trade, city)
        warnings.extend(payload_warnings)

    weekday = datetime.now(ZoneInfo("Australia/Sydney")).strftime("%a")
    n = cohort if refill else (target if isinstance(target, int) and target > 0 else "target")

    confirmed = camp.get("copy_confirmed_at")
    copy_pointer = {
        "source": "compass_confirmed" if confirmed else "compass_draft",
        "ref": f"GET /api/agent/outbound/campaigns/{campaign_id}/copy?full=1 -> sequence_draft",
        "copy_confirmed_at": confirmed,
        "review_required": not bool(confirmed),
    }

    return {
        "decision": decision,
        "trade": trade,
        "city": city_display,
        "campaign_id": campaign_id,
        "campaign_name": camp.get("name"),
        "offer_key": camp.get("offer_key"),
        "hypothesis": camp.get("hypothesis"),
        "targeting": {"source": "Compass offer lock", "offer_updated_at": offer.get("updated_at"), "icp": (offer.get("lock") or {}).get("icp"), "relevance": relevance, "screen": (offer.get("lock") or {}).get("screen"), "anti_icp": (offer.get("lock") or {}).get("antiIcp")},
        "sample_size_target": target,
        "instantly_remaining": remaining,
        "copy": copy_pointer,
        "instantly_preset": {
            "name": f"{city_display} {trade.upper() if trade == 'hvac' else trade.title()} | installation booking | {n} | {weekday}",
            "timezone": timezone,
            "gap_days_before_bump": 2,
            "text_only": True,
            "open_tracking": False,
            "link_tracking": False,
            "insert_unsubscribe_header": True,
            "stop_on_reply": True,
            "schedule": "weekdays",
        },
        "inventory": {
            "cohort_uncontacted_with_email": cohort,
            "reason": reason,
            "unassigned_trade_candidates": candidates,
            "candidate_review_url": candidate_path.replace("limit=1", "limit=200") if candidates else None,
        },
        "vortex_payload": payload,
        "refill_pull_url": (
            REFILL_PATH.format(campaign_id=urllib.parse.quote(str(campaign_id), safe=""))
            if refill
            else None
        ),
        "warnings": warnings,
    }


def print_job(job: dict) -> None:
    preset = job["instantly_preset"]
    inv = job["inventory"]
    print(f"JOB: {job['city']} {job['trade']}  (campaign {job['campaign_id']})")
    print(f"  name: {job['campaign_name']}")
    print(f"  offer_key: {job['offer_key']}")
    print(f"  hypothesis: {job['hypothesis'] or '-'}")
    print(f"  sample_size_target: {job['sample_size_target'] or '-'}")
    remaining = job["instantly_remaining"]
    print(
        "  instantly_remaining: "
        + (str(remaining) if remaining is not None else "not on the sending wave")
    )
    print(f"  cohort uncontacted-with-email: {inv['cohort_uncontacted_with_email']}")
    print()
    if job["decision"] == "refill":
        print(f"DECISION: REFILL - {inv['reason']}")
        print("Pull the cohort (page with &cursor=):")
        print(f"  GET {job['refill_pull_url']}")
        print(
            "Write a local CSV preserving source evidence, verification and outreach status. Research and verify pending rows, "
            "then process with outbound_worker.py using this campaign's saved writing rules."
        )
    elif job["decision"] == "review_inventory":
        print(f"DECISION: REVIEW INVENTORY - {inv['reason']}")
        print(f"  GET {inv['candidate_review_url']}")
        print("Candidates are not qualified, verified or approved for contact. Keep Maps off until reconciled.")
    else:
        print(f"DECISION: SCRAPE - {inv['reason']}")
        print("Vortex payload (vortex_data/google-maps):")
        print(json.dumps(job["vortex_payload"], indent=2))
    print()
    print(f"Copy: {job['copy']['source']} - {job['copy']['ref']}")
    print("Targeting: " + json.dumps(job["targeting"], ensure_ascii=False))
    print()
    print("Instantly preset:")
    print(f"  name: {preset['name']}")
    print(f"  timezone: {preset['timezone'] or 'CONFIRM (city not in baked map)'}")
    print(
        "  gap: at least two days; the saved campaign preparation and verified launch schedule govern the actual interval. "
        "text_only on; open/link tracking off; insert_unsubscribe_header on; "
        "stop_on_reply on; weekdays"
    )
    print()
    print(
        "Then: research/filter against the current Compass offer -> source-backed evidence -> recorded email verification -> "
        f"outbound_worker.py --campaign {job['campaign_id']} --input-csv <researched.csv> --output-dir <job-output> -> "
        "review complete output and holds in Compass -> operator approval -> instantly-load paused CSV -> exact recipient reconciliation. "
        "Activate only when Jules says go."
    )
    for warning in job["warnings"]:
        print(f"WARNING: {warning}")


class GateParser(argparse.ArgumentParser):
    def error(self, message):  # argparse usage errors must not read as "refill"
        self.exit(EXIT_ERROR, f"{self.prog}: error: {message}\n")


def main(argv: list[str] | None = None, client=None) -> int:
    parser = GateParser(description=__doc__.splitlines()[0])
    parser.add_argument("--campaign", help="Compass pipeline campaign id")
    parser.add_argument("--trade", help="electrical, hvac, plumber, locksmith, roofing, pest")
    parser.add_argument("--city", help="sydney, perth, ...")
    parser.add_argument(
        "--json",
        nargs="?",
        const="__default__",
        default=None,
        help="also write the job JSON to /tmp (default /tmp/factory-job-<campaign>.json)",
    )
    args = parser.parse_args(argv)

    if bool(args.trade) != bool(args.city):
        parser.error("--trade and --city travel together")

    try:
        if client is None:
            base, secret = load_config()
            client = CompassClient(base, secret)

        wave = None
        if args.campaign:
            campaign_id = args.campaign.strip()
        elif args.trade:
            campaign_id = resolve_from_desk(client, args.trade, args.city)
        else:
            campaign_id, wave = resolve_from_brief(client)
            if not campaign_id:
                print(
                    "NO NEXT CELL: brief morningWave has no activeNext / proposedNext. "
                    "Jules accepts the wave on Home or names --trade --city."
                )
                return EXIT_NEED_JULES

        if wave is None:
            try:
                _cid, wave = resolve_from_brief(client)
            except CompassError:
                wave = None  # brief is cached most days; its absence never gates the job

        job = build_job(client, campaign_id, wave)
    except CompassError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return EXIT_ERROR
    except LookupError as exc:
        print(f"NEED JULES: {exc}")
        return EXIT_NEED_JULES
    except SystemExit:
        raise

    if args.json:
        if args.json == "__default__":
            out = Path("/tmp") / f"factory-job-{job['campaign_id']}.json"
        else:
            out = Path(args.json)
            if not out.is_absolute():
                out = Path("/tmp") / out
        if str(out).startswith(str(OS_ROOT)):
            print("ERROR: --json writes to /tmp, not the repo", file=sys.stderr)
            return EXIT_ERROR
        out.write_text(json.dumps(job, indent=2), encoding="utf-8")
        print(f"job json: {out}")
        print()

    print_job(job)
    return {"refill": EXIT_REFILL, "scrape": EXIT_SCRAPE, "review_inventory": EXIT_REVIEW_INVENTORY}[job["decision"]]


if __name__ == "__main__":
    raise SystemExit(main())
