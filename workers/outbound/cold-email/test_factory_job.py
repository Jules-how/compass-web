#!/usr/bin/env python3
"""factory_job.py tests. All Compass HTTP is faked; nothing live is hit.

  python3 -m unittest test_factory_job.py
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import factory_job as fj

CAMPAIGN_ID = "campaign-au-electrical-perth-2026-09"


def copy_payload(**overrides) -> dict:
    campaign = {
        "id": CAMPAIGN_ID,
        "name": "Perth Electrical",
        "offer_key": "installation-booking",
        "vertical_tags": ["electrical"],
        "location_tags": ["Perth"],
        "hypothesis": "capacity CTA beats count CTA",
        "sample_size_target": 300,
        "copy_confirmed_at": None,
        "sequence_draft": {"steps": [{"id": "email-1"}]},
        "instantly_campaign_id": None,
    }
    campaign.update(overrides)
    return {"ok": True, "campaign": campaign}


def brief_payload(status="proposed", proposed=None, active=None, sending=None) -> dict:
    return {
        "ok": True,
        "brief": {
            "morningWave": {
                "briefStatus": status,
                "proposedNext": proposed if proposed is not None else [
                    {"campaignId": CAMPAIGN_ID, "trade": "electrical", "city": "Perth"}
                ],
                "activeNext": active if active is not None else [],
                "sending": sending if sending is not None else [],
            }
        },
    }


def desk_payload(cells=None) -> dict:
    return {
        "ok": True,
        "testing": [{"offer": {"offer_key": "installation-booking", "lock": {"relevance": [{"fact": "Relevant published service", "required": True, "source": "company website"}]}}}],
        "cells": cells
        if cells is not None
        else [
            {
                "key": "installation-booking|electrical|perth",
                "offerKey": "installation-booking",
                "vertical": "electrical",
                "city": "Perth",
                "campaigns": [{"id": CAMPAIGN_ID, "name": "Perth Electrical", "status": "planned"}],
            }
        ],
    }


class FakeClient:
    def __init__(self, brief=None, desk=None, copies=None, cohort_total=0, candidate_total=0):
        self._brief = brief
        self._desk = desk
        self._copies = copies or {}
        self._cohort_total = cohort_total
        self._candidate_total = candidate_total
        self.calls: list[str] = []

    def get(self, path: str) -> dict:
        self.calls.append(path)
        if path.startswith("/api/agent/brief"):
            if self._brief is None:
                raise fj.CompassError("brief unavailable")
            return self._brief
        if path.startswith("/api/agent/offers/desk"):
            return self._desk if self._desk is not None else desk_payload()
        if path.startswith("/api/agent/outbound/campaigns/"):
            campaign_id = path.split("/api/agent/outbound/campaigns/")[1].split("/")[0]
            if campaign_id not in self._copies:
                raise fj.CompassError("not_found")
            return self._copies[campaign_id]
        if path.startswith("/api/agent/leads"):
            return {"ok": True, "total": self._candidate_total if "pipeline_campaign_id=none" in path else self._cohort_total, "leads": []}
        raise fj.CompassError(f"unmapped path {path}")


def run(argv, client) -> tuple[int, str]:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = fj.main(argv, client=client)
    return code, buf.getvalue()


class TestResolveDefault(unittest.TestCase):
    def test_proposed_next_wins_while_unaccepted(self):
        client = FakeClient(
            brief=brief_payload(status="proposed"),
            copies={CAMPAIGN_ID: copy_payload()},
        )
        code, out = run([], client)
        self.assertEqual(code, fj.EXIT_SCRAPE)
        self.assertIn(CAMPAIGN_ID, out)

    def test_active_next_used_when_no_proposal(self):
        client = FakeClient(
            brief=brief_payload(status="accepted", proposed=[], active=[
                {"campaignId": CAMPAIGN_ID, "trade": "electrical", "city": "Perth"}
            ]),
            copies={CAMPAIGN_ID: copy_payload()},
        )
        code, out = run([], client)
        self.assertEqual(code, fj.EXIT_SCRAPE)
        self.assertIn(CAMPAIGN_ID, out)

    def test_empty_wave_is_need_jules(self):
        client = FakeClient(
            brief=brief_payload(status="accepted", proposed=[], active=[]),
        )
        code, out = run([], client)
        self.assertEqual(code, fj.EXIT_NEED_JULES)
        self.assertIn("NO NEXT CELL", out)

    def test_missing_wave_is_need_jules(self):
        client = FakeClient(brief={"ok": True, "brief": {"morningWave": None}})
        code, out = run([], client)
        self.assertEqual(code, fj.EXIT_NEED_JULES)


class TestResolveFlags(unittest.TestCase):
    def test_trade_city_resolves_via_desk(self):
        client = FakeClient(
            brief=brief_payload(),
            desk=desk_payload(),
            copies={CAMPAIGN_ID: copy_payload()},
        )
        code, out = run(["--trade", "electrician", "--city", "perth"], client)
        self.assertEqual(code, fj.EXIT_SCRAPE)
        self.assertTrue(any(c.startswith("/api/agent/offers/desk") for c in client.calls))

    def test_trade_city_without_cell_is_need_jules(self):
        client = FakeClient(brief=brief_payload(), desk=desk_payload(cells=[]))
        code, out = run(["--trade", "electrical", "--city", "perth"], client)
        self.assertEqual(code, fj.EXIT_NEED_JULES)
        self.assertIn("NEED JULES", out)

    def test_campaign_flag_skips_brief_and_desk(self):
        client = FakeClient(copies={CAMPAIGN_ID: copy_payload()})
        code, _out = run(["--campaign", CAMPAIGN_ID], client)
        self.assertEqual(code, fj.EXIT_SCRAPE)
        self.assertTrue(any("desk" in c for c in client.calls))  # active-offer validation remains required

    def test_trade_without_city_is_usage_error_not_refill(self):
        client = FakeClient()
        with self.assertRaises(SystemExit) as raised:
            run(["--trade", "electrical"], client)
        self.assertEqual(raised.exception.code, fj.EXIT_ERROR)


class TestGateDecision(unittest.TestCase):
    def test_cohort_rows_mean_refill_and_no_maps(self):
        client = FakeClient(
            brief=brief_payload(),
            copies={CAMPAIGN_ID: copy_payload()},
            cohort_total=37,
        )
        code, out = run([], client)
        self.assertEqual(code, fj.EXIT_REFILL)
        self.assertIn("REFILL", out)
        self.assertIn("37", out)
        self.assertIn("pipeline_campaign_id=" + CAMPAIGN_ID, out)
        self.assertNotIn("searchStringsArray", out)

    def test_empty_cohort_means_scrape_with_payload(self):
        client = FakeClient(
            brief=brief_payload(),
            copies={CAMPAIGN_ID: copy_payload()},
            cohort_total=0,
        )
        code, out = run([], client)
        self.assertEqual(code, fj.EXIT_SCRAPE)
        self.assertIn("SCRAPE", out)
        self.assertIn("searchStringsArray", out)

    def test_cohort_count_call_uses_campaign_cohort_filters(self):
        client = FakeClient(
            brief=brief_payload(),
            copies={CAMPAIGN_ID: copy_payload()},
        )
        run([], client)
        leads_calls = [c for c in client.calls if c.startswith("/api/agent/leads")]
        self.assertEqual(len(leads_calls), 2)
        call = leads_calls[0]
        self.assertIn("pipeline_campaign_id=" + CAMPAIGN_ID, call)
        self.assertIn("outbound_status=uncontacted", call)
        self.assertIn("completeness=has_email", call)
        self.assertIn("bucket=leads", call)


class TestVortexPayload(unittest.TestCase):
    def test_perth_uses_polygon_not_named_location(self):
        payload, warnings = fj.vortex_payload("electrical", "perth")
        self.assertIn("customGeolocation", payload)
        self.assertNotIn("locationQueries", payload)
        self.assertEqual(warnings, [])
        coords = payload["customGeolocation"]["features"][0]["geometry"]["coordinates"][0]
        self.assertEqual(coords[0], coords[-1])  # closed ring

    def test_sydney_named_greater_location(self):
        payload, warnings = fj.vortex_payload("electrical", "sydney")
        self.assertEqual(
            payload["locationQueries"], ["Greater Sydney, New South Wales, Australia"]
        )
        self.assertNotIn("customGeolocation", payload)
        self.assertEqual(warnings, [])

    def test_city_never_in_search_terms(self):
        for trade in ("electrical", "hvac", "plumber", "locksmith", "roofing", "pest"):
            for city in ("perth", "sydney", "melbourne"):
                payload, _ = fj.vortex_payload(trade, city)
                for term in payload["searchStringsArray"]:
                    self.assertNotIn(city, term.lower())
                    self.assertNotIn("[", term)

    def test_unknown_city_warns_but_emits(self):
        payload, warnings = fj.vortex_payload("electrical", "toowoomba")
        self.assertEqual(payload["locationQueries"], ["Greater Toowoomba, Australia"])
        self.assertTrue(warnings)

    def test_contacts_and_reviews_stay_off(self):
        payload, _ = fj.vortex_payload("plumber", "brisbane")
        self.assertFalse(payload["extractContactsFromWebsite"])
        self.assertEqual(payload["maxReviewsPerPlace"], 0)
        self.assertFalse(payload["geoStrictMatch"])
        self.assertEqual(payload["maxCrawledPlacesPerSearch"], 2000)


class TestCopyPointerAndPreset(unittest.TestCase):
    def test_unconfirmed_copy_stays_compass_draft(self):
        client = FakeClient(
            brief=brief_payload(),
            copies={CAMPAIGN_ID: copy_payload(copy_confirmed_at=None)},
        )
        _code, out = run([], client)
        self.assertIn("compass_draft", out)
        self.assertNotIn("fill-capture.md", out)

    def test_confirmed_copy_points_at_compass_sequence(self):
        client = FakeClient(
            brief=brief_payload(),
            copies={CAMPAIGN_ID: copy_payload(copy_confirmed_at="2026-09-05T00:00:00Z")},
        )
        _code, out = run([], client)
        self.assertIn("compass_confirmed", out)
        self.assertIn("sequence_draft", out)

    def test_preset_matches_locked_shape(self):
        client = FakeClient(
            brief=brief_payload(
                sending=[{"campaignId": CAMPAIGN_ID, "remaining": 41}]
            ),
            copies={CAMPAIGN_ID: copy_payload()},
            cohort_total=37,
        )
        code, out = run([], client)
        self.assertEqual(code, fj.EXIT_REFILL)
        self.assertIn("Perth Electrical | installation booking | 37 |", out)
        self.assertIn("Australia/Perth", out)
        self.assertIn("instantly_remaining: 41", out)
        self.assertIn("insert_unsubscribe_header on", out)


class TestJsonOut(unittest.TestCase):
    def test_json_writes_tmp_not_repo(self):
        client = FakeClient(
            brief=brief_payload(),
            copies={CAMPAIGN_ID: copy_payload()},
        )
        with tempfile.TemporaryDirectory(dir="/tmp") as tmp:
            dest = Path(tmp) / "job.json"
            code, out = run(["--json", str(dest)], client)
            self.assertEqual(code, fj.EXIT_SCRAPE)
            job = json.loads(dest.read_text())
            self.assertEqual(job["campaign_id"], CAMPAIGN_ID)
            self.assertEqual(job["decision"], "scrape")

    def test_json_refuses_repo_path(self):
        client = FakeClient(
            brief=brief_payload(),
            copies={CAMPAIGN_ID: copy_payload()},
        )
        code, _out = run(
            ["--json", str(fj.OS_ROOT / "cold-email" / "tickets.json")], client
        )
        self.assertEqual(code, fj.EXIT_ERROR)

    def test_compass_error_is_exit_4(self):
        class Boom:
            def get(self, path):
                raise fj.CompassError("HTTP 500")

        code, _out = run([], Boom())
        self.assertEqual(code, fj.EXIT_ERROR)


class TestMapsTermsOwner(unittest.TestCase):
    def test_every_vertical_exposes_bare_terms(self):
        from vertical_spec import maps_terms_for_trade

        for trade in ("electrical", "hvac", "plumber", "locksmith", "roofing", "pest"):
            terms = maps_terms_for_trade(trade)
            self.assertTrue(terms, trade)
            for term in terms:
                self.assertNotIn("[", term)
                self.assertNotIn("australia", term.lower())
                self.assertNotIn("locationqueries", term.lower())

    def test_electrical_term_is_exact(self):
        from vertical_spec import maps_terms_for_trade

        self.assertEqual(maps_terms_for_trade("electrical"), ("electrical contractors",))


class TestFreshBrief(unittest.TestCase):
    def test_job_selection_requests_current_compass_brief(self):
        requests = []
        def open_request(req, timeout):
            requests.append(req)
            return contextlib.closing(io.BytesIO(b'{"ok": true}'))
        with patch("factory_job.urllib.request.urlopen", open_request):
            client = fj.CompassClient("https://compass.test", "test-secret")
            client.get("/api/agent/brief")
            client.get("/api/agent/leads?view=rows")
        self.assertEqual(requests[0].get_header("X-compass-fresh"), "1")
        self.assertIsNone(requests[1].get_header("X-compass-fresh"))


class TestCurrentOfferSafety(unittest.TestCase):
    def test_retired_campaign_cannot_generate_job(self):
        c = FakeClient(copies={CAMPAIGN_ID: copy_payload(offer_key="booked-jobs-system")})
        code, out = run(["--campaign", CAMPAIGN_ID], c)
        self.assertEqual(code, fj.EXIT_NEED_JULES)
        self.assertNotIn("searchStringsArray", out)

    def test_existing_candidates_block_paid_discovery(self):
        c = FakeClient(copies={CAMPAIGN_ID: copy_payload()}, candidate_total=435)
        job = fj.build_job(c, CAMPAIGN_ID, None)
        self.assertEqual(job["decision"], "review_inventory")
        self.assertIsNone(job["vortex_payload"])
        self.assertEqual(job["inventory"]["unassigned_trade_candidates"], 435)
        code, _ = run(["--campaign", CAMPAIGN_ID], c)
        self.assertEqual(code, fj.EXIT_REVIEW_INVENTORY)

    def test_missing_count_does_not_start_a_scrape(self):
        c = FakeClient(copies={CAMPAIGN_ID: copy_payload()}, cohort_total=None)
        code, _ = run(["--campaign", CAMPAIGN_ID], c)
        self.assertEqual(code, fj.EXIT_ERROR)

    def test_empty_sequence_never_uses_legacy_copy(self):
        c = FakeClient(copies={CAMPAIGN_ID: copy_payload(sequence_draft={})})
        code, out = run(["--campaign", CAMPAIGN_ID], c)
        self.assertEqual(code, fj.EXIT_NEED_JULES)
        self.assertNotIn("fill-capture.md", out)

if __name__ == "__main__":
    unittest.main()
