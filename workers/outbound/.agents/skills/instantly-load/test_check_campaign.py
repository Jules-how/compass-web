#!/usr/bin/env python3
"""check_campaign.py tests.

  python3 -m unittest test_check_campaign.py
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from check_campaign import check_campaign, check_lead_rendering, main, unwrap


def good_campaign() -> dict:
    return {
        "id": "abc",
        "name": "Sydney HVAC | fill | 150 | Mon",
        "status": 0,
        "stop_on_reply": True,
        "text_only": True,
        "open_tracking": False,
        "link_tracking": False,
        "insert_unsubscribe_header": True,
        "campaign_schedule": {
            "schedules": [
                {
                    "name": "Weekdays",
                    "timezone": "Australia/Sydney",
                    "days": {"monday": True, "saturday": False},
                }
            ]
        },
        "sequences": [
            {
                "steps": [
                    {
                        "type": "email",
                        "delay": 2,
                        "variants": [
                            {
                                "subject": "{{subject}}",
                                "body": '{{personalization}}\n\nInstead of shared leads...\n<a href="{{unsubscribe}}">Unsubscribe</a>',
                            }
                        ],
                    },
                    {
                        "type": "email",
                        "delay": 0,
                        "variants": [{"subject": "", "body": 'Still on...\n<a href="{{unsubscribe}}">Unsubscribe</a>'}],
                    },
                ]
            }
        ],
    }


class TestGate(unittest.TestCase):
    def test_nonfinite_delay_fails(self):
        for delay in (float("nan"), float("inf")):
            camp = good_campaign()
            camp["sequences"][0]["steps"][0]["delay"] = delay
            self.assertTrue(any("gap after" in f for f in check_campaign(camp)))

    def test_no_enabled_days_fails(self):
        for days in ({}, {"1": False}, None):
            camp = good_campaign()
            camp["campaign_schedule"]["schedules"][0]["days"] = days
            self.assertTrue(any("no enabled" in f for f in check_campaign(camp)))

    def test_numeric_days_and_weekend_override(self):
        camp = good_campaign()
        days = camp["campaign_schedule"]["schedules"][0]["days"] = {"1": True, "6": False}
        self.assertEqual(check_campaign(camp), [])
        days["6"] = True
        self.assertTrue(any("weekends" in f for f in check_campaign(camp)))
        self.assertEqual(check_campaign(camp, allow_weekends=True), [])

    def test_every_schedule_must_match_timezone(self):
        camp = good_campaign()
        camp["campaign_schedule"]["schedules"].append({"timezone": "Australia/Perth", "days": {"1": True}})
        self.assertTrue(any("timezone" in f for f in check_campaign(camp, "Australia/Sydney")))

    def test_good_campaign_passes(self):
        self.assertEqual(check_campaign(good_campaign(), "Australia/Sydney"), [])

    def test_live_campaign_fails(self):
        camp = good_campaign()
        camp["status"] = 1
        fails = check_campaign(camp, "Australia/Sydney")
        self.assertTrue(any("draft" in f for f in fails))

    def test_one_day_gap_fails(self):
        camp = good_campaign()
        camp["sequences"][0]["steps"][0]["delay"] = 1
        fails = check_campaign(camp, "Australia/Sydney")
        self.assertTrue(any("gap after email 1" in f for f in fails))

    def test_three_email_middle_gap_checked(self):
        camp = good_campaign()
        middle = {
            "type": "email",
            "delay": 1,
            "variants": [{"subject": "", "body": "bump 2"}],
        }
        camp["sequences"][0]["steps"].insert(1, middle)
        fails = check_campaign(camp, "Australia/Sydney")
        self.assertTrue(any("gap after email 2" in f for f in fails))

    def test_wrong_timezone_fails(self):
        fails = check_campaign(good_campaign(), "Australia/Perth")
        self.assertTrue(any("timezone" in f for f in fails))

    def test_text_only_off_fails(self):
        camp = good_campaign()
        camp["text_only"] = False
        self.assertTrue(any("text_only" in f for f in check_campaign(camp)))

    def test_tracking_on_fails(self):
        camp = good_campaign()
        camp["open_tracking"] = True
        self.assertTrue(any("open_tracking" in f for f in check_campaign(camp)))

    def test_missing_unsub_header_fails(self):
        camp = good_campaign()
        del camp["insert_unsubscribe_header"]
        fails = check_campaign(camp)
        self.assertTrue(any("insert_unsubscribe_header" in f for f in fails))

    def test_campaign_greeting_fails(self):
        camp = good_campaign()
        camp["sequences"][0]["steps"][0]["variants"][0]["body"] = (
            "Hi {{firstName}},\n\n{{personalization}}\n\n..."
        )
        fails = check_campaign(camp)
        self.assertTrue(any("{{personalization}}" in f for f in fails))

    def test_div_wrapped_personalization_passes(self):
        camp = good_campaign()
        camp["sequences"][0]["steps"][0]["variants"][0]["body"] = (
            '<div>{{personalization}}</div><div><br /></div><div>Body line.</div><a href="{{unsubscribe}}">Unsubscribe</a>'
        )
        self.assertEqual(check_campaign(camp, "Australia/Sydney"), [])

    def test_div_wrapped_greeting_still_fails(self):
        camp = good_campaign()
        camp["sequences"][0]["steps"][0]["variants"][0]["body"] = (
            "<div>Hi {{firstName}},</div><div>{{personalization}}</div>"
        )
        fails = check_campaign(camp)
        self.assertTrue(any("{{personalization}}" in f for f in fails))

    def test_single_email_fails(self):
        camp = good_campaign()
        camp["sequences"][0]["steps"] = camp["sequences"][0]["steps"][:1]
        self.assertTrue(any("1 email step" in f for f in check_campaign(camp)))

    def test_no_timezone_arg_accepts_any_au_zone(self):
        camp = good_campaign()
        camp["campaign_schedule"]["schedules"][0]["timezone"] = "Australia/Perth"
        self.assertEqual(check_campaign(camp), [])

    def test_no_timezone_arg_rejects_non_au(self):
        camp = good_campaign()
        camp["campaign_schedule"]["schedules"][0]["timezone"] = "America/New_York"
        self.assertTrue(any("timezone" in f for f in check_campaign(camp)))

    def test_envelope_unwrap(self):
        wrapped = {"campaign": good_campaign()}
        self.assertEqual(unwrap(wrapped)["id"], "abc")
        self.assertEqual(check_campaign(unwrap(wrapped), "Australia/Sydney"), [])


class TestCli(unittest.TestCase):
    def test_rendering_catches_blank_bump_and_verification_gap(self):
        row = {"email": "owner@example.test", "email_status": "valid", "outbound_status": "uncontacted", "opener": "Saw Example in Richmond.", "subject": "richmond jobs", "suburb": "Richmond", "first_name": ""}
        campaign = good_campaign()
        self.assertEqual(check_lead_rendering(campaign, [row]), [])
        campaign["sequences"][0]["steps"][1]["variants"][0]["body"] = "Hi {{firstName}},"
        self.assertTrue(any("blank-name" in f for f in check_lead_rendering(campaign, [row])))
        row["email_status"] = ""
        self.assertTrue(any("verification" in f for f in check_lead_rendering(campaign, [row])))

    def test_rendering_catches_unmapped_variables_and_duplicates(self):
        row = {"email": "owner@example.test", "email_status": "valid", "outbound_status": "uncontacted", "opener": "Saw Example in Richmond.", "subject": "richmond jobs", "suburb": "Richmond"}
        campaign = good_campaign()
        campaign["sequences"][0]["steps"][1]["variants"][0]["body"] = "{{unmapped}}"
        fails = check_lead_rendering(campaign, [row, row])
        self.assertTrue(any("unresolved" in f for f in fails))
        self.assertTrue(any("duplicate" in f for f in fails))

    def test_present_but_empty_merge_is_rejected(self):
        row = {"email": "owner@example.test", "email_status": "valid", "outbound_status": "uncontacted", "opener": "Saw Example in Richmond.", "subject": "richmond jobs", "service": ""}
        campaign = good_campaign()
        campaign["sequences"][0]["steps"][1]["variants"][0]["body"] = "About {{service}}"
        self.assertTrue(any("service" in failure for failure in check_lead_rendering(campaign, [row])))
        row["service"] = "   "
        self.assertTrue(any("service" in failure for failure in check_lead_rendering(campaign, [row])))

    def test_exit_codes(self):
        with tempfile.TemporaryDirectory() as tmp:
            good = Path(tmp) / "good.json"
            good.write_text(json.dumps(good_campaign()))
            self.assertEqual(main([str(good), "--timezone", "Australia/Sydney"]), 0)

            bad = Path(tmp) / "bad.json"
            camp = good_campaign()
            camp["status"] = 1
            bad.write_text(json.dumps(camp))
            self.assertEqual(main([str(bad)]), 1)

            self.assertEqual(main([str(Path(tmp) / "missing.json")]), 2)


if __name__ == "__main__":
    unittest.main()
