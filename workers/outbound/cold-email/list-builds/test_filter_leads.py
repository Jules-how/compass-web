#!/usr/bin/env python3
"""leak_score tests against live plumber and HVAC list-build CSVs."""

import csv
import tempfile
import unittest
from pathlib import Path

from filter_leads import (
    compute_leak_score,
    evaluate_anti_icp,
    evaluate_leak_signals,
    is_sendable_email,
    run_filter,
)

OUT = Path(__file__).resolve().parent / "out"
PLUMBER_SYDNEY = OUT / "plumber" / "plumber-sydney-202608.csv"
PLUMBER_SYDNEY_SENDABLE = OUT / "plumber" / "plumber-sydney-sendable-202608.csv"
PLUMBER_SYDNEY_UNSENDABLE = OUT / "plumber" / "plumber-sydney-unsendable-202608.csv"
PLUMBER_PERTH = OUT / "plumber" / "plumber-perth-202608.csv"
HVAC_ADELAIDE = OUT / "hvac" / "hvac-adelaide-202608.csv"
HVAC_MELBOURNE = OUT / "hvac" / "hvac-melbourne-202608.csv"
HVAC_BRISBANE = OUT / "hvac" / "hvac-brisbane-202608.csv"


def _load(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _named(rows: list[dict], name: str) -> dict:
    for row in rows:
        company = (row.get("business_name") or row.get("company") or "").strip()
        if company == name:
            return row
    raise AssertionError(f"No row named {name!r}")


def _row_key(row: dict) -> tuple[str, str]:
    name = (row.get("business_name") or row.get("company") or "").strip().lower()
    email = (row.get("primary_email") or row.get("email") or "").strip().lower()
    return name, email


@unittest.skipUnless(all(p.exists() for p in (PLUMBER_SYDNEY, PLUMBER_PERTH, HVAC_ADELAIDE, HVAC_MELBOURNE, HVAC_BRISBANE)), "Private historical lead CSVs are not present in this checkout")
class LeakScoreFromLiveRows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plumber_sydney = _load(PLUMBER_SYDNEY)
        cls.plumber_perth = _load(PLUMBER_PERTH)
        cls.hvac_adelaide = _load(HVAC_ADELAIDE)
        cls.hvac_melbourne = _load(HVAC_MELBOURNE)
        cls.hvac_brisbane = _load(HVAC_BRISBANE)

    def test_hours_and_owner_are_not_leak_points(self):
        row = _named(self.plumber_sydney, "Ezyflow H2O Plumbing Solutions")
        signals = evaluate_leak_signals(row)
        self.assertFalse(signals["answering_service"])
        self.assertIn(signals["leak_score"], (0, -1))

    def test_plumber_without_answering_or_booking_is_zero(self):
        row = _named(self.plumber_sydney, "Absolute Plumbing")
        signals = evaluate_leak_signals(row)
        self.assertFalse(signals["answering_service"])
        self.assertIn(signals["leak_score"], (0, -1))

    def test_hvac_adelaide_no_raw_data_does_not_guess_booking(self):
        row = _named(self.hvac_adelaide, "Sinclair Refrigeration")
        signals = evaluate_leak_signals(row)
        self.assertFalse(signals["booking_widget"], "no raw_data: do not guess booking")
        self.assertFalse(signals["answering_service"])
        self.assertEqual(signals["leak_score"], 0)

    def test_hvac_24h_claim_is_not_a_leak_point(self):
        row = _named(self.hvac_adelaide, "Murray Heating and Cooling")
        self.assertEqual(compute_leak_score(row), 0)

    def test_hvac_brisbane_weekday_hours_are_not_a_leak_point(self):
        row = _named(self.hvac_brisbane, "Spanos ElectriCool")
        self.assertEqual(compute_leak_score(row), 0)

    def test_hvac_brisbane_open_24_hours_is_not_a_leak_point(self):
        row = _named(self.hvac_brisbane, "Reliable Tradies")
        self.assertEqual(compute_leak_score(row), 0)

    def test_hvac_melbourne_thin_row_scores_zero(self):
        row = _named(self.hvac_melbourne, "XRCC - Air Conditioning and Refrigeration")
        signals = evaluate_leak_signals(row)
        self.assertFalse(signals["booking_widget"])
        self.assertFalse(signals["answering_service"])
        self.assertEqual(signals["leak_score"], 0)

    def test_perth_without_call_centers_is_not_answering_service(self):
        row = _named(self.plumber_perth, "LANE Plumbing and Gas")
        signals = evaluate_leak_signals(row)
        self.assertFalse(signals["answering_service"])

    def test_answering_service_language_is_negative_not_a_drop(self):
        row = dict(_named(self.hvac_adelaide, "Sinclair Refrigeration"))
        row["hours_claim"] = "24/7 live answering"
        signals = evaluate_leak_signals(row)
        self.assertTrue(signals["answering_service"])
        self.assertEqual(signals["leak_score"], -1)

    def test_booking_widget_is_negative_not_a_drop(self):
        row = dict(_named(self.plumber_sydney, "Absolute Plumbing"))
        raw = row["raw_data"].replace(
            '"order_platforms":null',
            '"order_platforms":["servicem8"]',
        )
        row["raw_data"] = raw
        signals = evaluate_leak_signals(row)
        self.assertTrue(signals["booking_widget"])
        self.assertEqual(signals["leak_score"], -1)


@unittest.skipUnless(all(p.exists() for p in (PLUMBER_SYDNEY, PLUMBER_SYDNEY_SENDABLE, HVAC_MELBOURNE)), "Private historical lead CSVs are not present in this checkout")
class Mode2SplitUnchanged(unittest.TestCase):
    def test_plumber_sydney_membership_matches_existing_split(self):
        with tempfile.TemporaryDirectory() as tmp:
            sendable_path, unsendable_path = run_filter(
                PLUMBER_SYDNEY,
                Path(tmp),
                require_paid_demand=False,
            )
            got_sendable = _load(sendable_path)
            got_unsendable = _load(unsendable_path)

        self.assertIn("leak_score", got_sendable[0])
        self.assertIn("leak_score", got_unsendable[0])
        self.assertIn("exclusion_reason", got_unsendable[0])
        self.assertNotIn("exclusion_reason", got_sendable[0])

        prior_sendable = {_row_key(r) for r in _load(PLUMBER_SYDNEY_SENDABLE)}
        got_sendable_keys = {_row_key(r) for r in got_sendable}
        newly_walked = prior_sendable - got_sendable_keys
        walked_reasons = {
            _row_key(r): r.get("exclusion_reason")
            for r in got_unsendable
            if _row_key(r) in newly_walked
        }
        self.assertEqual(set(walked_reasons), newly_walked)
        self.assertTrue(all(str(reason).startswith("disqualified_") for reason in walked_reasons.values()))
        self.assertIn(
            ("planet plumbing - head office", "info@planetplumbing.com.au"),
            got_sendable_keys,
        )
        self.assertIn(
            ("hero air conditioning - hero home services", "info@heroairconditioning.com.au"),
            got_sendable_keys,
        )

    def test_answering_service_row_stays_sendable(self):
        wps = _named(_load(PLUMBER_SYDNEY), "WPS PLUMBING & LEAK DETECTION P/L")
        self.assertTrue(is_sendable_email(wps))
        self.assertIsNone(evaluate_anti_icp(wps))
        patched = dict(wps)
        patched["hours_claim"] = f"{wps.get('hours_claim') or ''} 24/7 live answering"
        self.assertLess(compute_leak_score(patched), compute_leak_score(wps))
        self.assertTrue(is_sendable_email(patched))
        self.assertIsNone(evaluate_anti_icp(patched))

        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "wps-202608.csv"
            out_dir = Path(tmp) / "out"
            with PLUMBER_SYDNEY.open(encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                fieldnames = list(reader.fieldnames or [])
            with src.open("w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerow(patched)
            sendable_path, unsendable_path = run_filter(
                src, out_dir, require_paid_demand=False
            )
            sendable = _load(sendable_path)
            unsendable = _load(unsendable_path)

        self.assertEqual(len(sendable), 1)
        self.assertEqual(len(unsendable), 0)
        self.assertEqual(sendable[0]["primary_email"], wps["primary_email"])
        self.assertTrue(int(sendable[0]["leak_score"]) < compute_leak_score(wps))

    def test_hvac_melbourne_split_unchanged_and_scored(self):
        rows = _load(HVAC_MELBOURNE)
        with tempfile.TemporaryDirectory() as tmp:
            sendable_path, unsendable_path = run_filter(
                HVAC_MELBOURNE,
                Path(tmp),
                require_paid_demand=False,
            )
            sendable = _load(sendable_path)
            unsendable = _load(unsendable_path)

        self.assertEqual(len(sendable) + len(unsendable), len(rows))
        self.assertTrue(all("leak_score" in r for r in unsendable))
        self.assertTrue(all(str(r.get("exclusion_reason") or "").startswith("disqualified_") for r in unsendable))
        xrcc = _named(sendable, "XRCC - Air Conditioning and Refrigeration")
        self.assertEqual(int(xrcc["leak_score"]), 0)
        self.assertNotIn("exclusion_reason", xrcc)


class TestAntiIcpWalk(unittest.TestCase):
    def _row(self, name, email="ok@shop.test", trade="Plumber", **extra):
        row = {
            "business_name": name,
            "trade": trade,
            "services": "",
            "primary_email": email,
            "email_status": "ok",
            "raw_data": "{}",
        }
        row.update(extra)
        return row

    def test_perth_walks_that_slipped(self):
        cases = [
            ("Bidi Facility Services", "disqualified_facility_management"),
            ("Beyond Kitchens", "disqualified_non_trade_or_civil"),
            ("Proline Plumbing & Civil PTY LTD", "disqualified_non_trade_or_civil"),
            ("Onslow Contracting", "disqualified_non_trade_or_civil"),
            ("McRobert Contracting Services", "disqualified_non_trade_or_civil"),
            ("Longreach Building Services", "disqualified_non_trade_or_civil"),
            ("Type B Gas Installations", "disqualified_non_trade_or_civil"),
            ("Cleaning Crusader", "disqualified_non_trade_or_civil"),
            ("Know Renovation", "disqualified_non_trade_or_civil"),
            ("Estimating Solutions Group", "disqualified_non_trade_or_civil"),
            ("Six Star Projects", "disqualified_non_trade_or_civil"),
            ("West Coast Trades Services", "disqualified_non_trade_or_civil"),
            ("Adaptable Group", "disqualified_head_office_or_national"),
            ("Nemjon is a commercial plumbing & drainage", "disqualified_mismatched_entity"),
        ]
        for name, reason in cases:
            self.assertEqual(evaluate_anti_icp(self._row(name)), reason, name)

    def test_privacy_and_veolia_inboxes(self):
        self.assertEqual(
            evaluate_anti_icp(self._row("Allpipe Technologies", email="privacy@allpipe.test")),
            "disqualified_head_office_or_national",
        )
        self.assertEqual(
            evaluate_anti_icp(self._row("Allpipe Technologies", email="admin@veolia.com.au")),
            "disqualified_head_office_or_national",
        )

    def test_real_plumber_shop_stays(self):
        self.assertIsNone(evaluate_anti_icp(self._row("Rayco Plumbing")))
        self.assertIsNone(evaluate_anti_icp(self._row("Pratt Plumbers")))
        self.assertIsNone(evaluate_anti_icp(self._row("Mackie Plumbing and Gas")))
        self.assertIsNone(evaluate_anti_icp(self._row("ARA Plumbing Group")))
        self.assertIsNone(evaluate_anti_icp(self._row("All Hours Plumbing Group Pty Ltd")))
        hoy = self._row("Hoy Plumbing Group", trade="Plumbing Company")
        hoy["services"] = "Facilities management"
        self.assertIsNone(evaluate_anti_icp(hoy))
        self.assertIsNone(evaluate_anti_icp(self._row("Smith Plumbing Contracting")))
        self.assertIsNone(evaluate_anti_icp(self._row("Roof Projects")))
        self.assertIsNone(evaluate_anti_icp(self._row("Planet Plumbing - Head Office")))
        self.assertIsNone(
            evaluate_anti_icp(self._row("Hero Air Conditioning", trade="Air Conditioning Services"))
        )

    def test_campaign_walks_other_in_trades(self):
        hvac = self._row("Hero Air Conditioning", trade="Air Conditioning Services")
        pest = self._row("Sydney Pest Control", trade="Pest Control")
        roof = self._row("Adelaide Roofing", trade="Roofing Contractor")
        self.assertEqual(evaluate_anti_icp(hvac, campaign_trade="plumber"), "disqualified_mismatched_entity")
        self.assertEqual(evaluate_anti_icp(pest, campaign_trade="plumber"), "disqualified_mismatched_entity")
        self.assertEqual(evaluate_anti_icp(roof, campaign_trade="plumber"), "disqualified_mismatched_entity")
        self.assertIsNone(evaluate_anti_icp(pest, campaign_trade="pest"))
        self.assertIsNone(evaluate_anti_icp(roof, campaign_trade="roofing"))
        self.assertIsNone(evaluate_anti_icp(self._row("Rayco Plumbing"), campaign_trade="plumber"))

    def test_electrical_and_locksmith_mismatch(self):
        spark = self._row("Spark Right Electrical", trade="Electrician")
        lock = self._row("Bondi Locksmiths", trade="Locksmith")
        hvac = self._row("Hero Air Conditioning", trade="Air Conditioning Services")
        self.assertEqual(evaluate_anti_icp(spark, campaign_trade="plumber"), "disqualified_mismatched_entity")
        self.assertEqual(evaluate_anti_icp(lock, campaign_trade="electrical"), "disqualified_mismatched_entity")
        self.assertEqual(evaluate_anti_icp(hvac, campaign_trade="locksmith"), "disqualified_mismatched_entity")
        self.assertIsNone(evaluate_anti_icp(spark, campaign_trade="electrical"))
        self.assertIsNone(evaluate_anti_icp(lock, campaign_trade="locksmith"))

    def test_maps_category_mismatch_without_name_token(self):
        plumber = {
            "business_name": "Coast Flow",
            "categoryName": "Plumber",
            "categories": "Plumber; Drainage service",
            "email": "ok@shop.test",
            "raw_data": "{}",
        }
        self.assertEqual(
            evaluate_anti_icp(plumber, campaign_trade="electrical"),
            "disqualified_mismatched_entity",
        )

    def test_secondary_maps_supplier_tag_does_not_walk_electrician(self):
        row = {
            "business_name": "Brillare Perth Electricians",
            "categoryName": "Electrician",
            "categories": '["Electrician","Electrical installation service","Lighting store"]',
            "email": "ok@shop.test",
            "raw_data": "{}",
        }
        self.assertIsNone(evaluate_anti_icp(row, campaign_trade="electrical"))

    def test_primary_wholesaler_category_still_walks(self):
        row = {
            "business_name": "City Electric Supply",
            "categoryName": "Electrical products wholesaler",
            "categories": '["Electrical products wholesaler"]',
            "email": "ok@shop.test",
            "raw_data": "{}",
        }
        self.assertEqual(
            evaluate_anti_icp(row, campaign_trade="electrical"),
            "disqualified_supplier_or_store",
        )

    def test_electrical_contracting_name_stays_when_category_matches(self):
        row = {
            "Business Name": "Onslow Contracting",
            "Trade": "Electrical Contractor",
            "Email": "ok@shop.test",
            "Raw Data": "{}",
        }
        self.assertEqual(evaluate_anti_icp(row), "disqualified_non_trade_or_civil")
        self.assertIsNone(evaluate_anti_icp(row, campaign_trade="electrical"))

    def test_jims_franchise_any_trade(self):
        self.assertEqual(
            evaluate_anti_icp(self._row("Jim's Pest Control", trade="Pest Control")),
            "disqualified_national_franchise",
        )
        self.assertEqual(
            evaluate_anti_icp(self._row("Jim's Roofing", trade="Roofing Contractor")),
            "disqualified_national_franchise",
        )


class TestOrigamiHeaders(unittest.TestCase):
    def test_title_case_walk_and_email(self):
        row = {
            "Business Name": "Onslow Contracting",
            "Trade": "Electrical Contractor",
            "Email": "ok@shop.test",
            "Email Status": "ok",
            "Raw Data": "{}",
        }
        self.assertEqual(evaluate_anti_icp(row), "disqualified_non_trade_or_civil")
        stay = {
            "Business Name": "Shepherd Industries",
            "Trade": "Electrical Contractor",
            "Email": "ben@shepherd.test",
            "Email Status": "ok",
            "Website": "https://shepherdindustries.com.au/",
            "Hours Claim": "emergency electrician",
            "Raw Data": '{"ownership_type":"FAMILY","staffs":[{"name":"Ben","role":"owner"}],"order_platforms":null}',
        }
        self.assertIsNone(evaluate_anti_icp(stay))
        self.assertTrue(is_sendable_email(stay))
        self.assertEqual(compute_leak_score(stay), 0)
        self.assertFalse(
            is_sendable_email({
                "Email": "trap@shop.test",
                "Email Status": "ok",
                "Email Quality": "dangerous",
            })
        )
        self.assertTrue(
            is_sendable_email({
                "Email": "maybe@shop.test",
                "Email Status": "error",
            })
        )
        self.assertTrue(
            is_sendable_email({
                "Email": "ben@shop.test",
                "Email Status": "catch_all",
                "Email Quality": "risky",
            })
        )

    def test_title_case_csv_split(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "electrical-gold-coast-202608.csv"
            with src.open("w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(
                    f,
                    fieldnames=["Business Name", "Verified Email", "Email Status", "Trade", "Website", "Raw Data"],
                )
                writer.writeheader()
                writer.writerow({
                    "Business Name": "Shepherd Industries",
                    "Verified Email": "ben@shepherd.test",
                    "Email Status": "ok",
                    "Trade": "Electrical Contractor",
                    "Website": "https://shepherdindustries.com.au/",
                    "Raw Data": "{}",
                })
                writer.writerow({
                    "Business Name": "Onslow Contracting",
                    "Verified Email": "skip@shop.test",
                    "Email Status": "ok",
                    "Trade": "Electrical Contractor",
                    "Website": "https://onslow.test/",
                    "Raw Data": "{}",
                })
            sendable_path, unsendable_path = run_filter(
                src, Path(tmp) / "out", require_paid_demand=False
            )
            sendable = _load(sendable_path)
            unsendable = _load(unsendable_path)
        self.assertEqual(len(sendable), 1)
        self.assertEqual(sendable[0]["Business Name"], "Shepherd Industries")
        self.assertEqual(unsendable[0]["exclusion_reason"], "disqualified_non_trade_or_civil")
        self.assertEqual(list(sendable[0].keys())[-1], "Raw Data")


class TestIncomingSheetShapes(unittest.TestCase):
    def test_maps_and_apify_headers_split(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "plumber-alt-202609.csv"
            with src.open("w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(
                    f,
                    fieldnames=[
                        "Company Name",
                        "verified_email",
                        "status",
                        "website_url",
                        "Trade",
                    ],
                )
                writer.writeheader()
                writer.writerow({
                    "Company Name": "Rayco Plumbing",
                    "verified_email": "shane@rayco.test",
                    "status": "valid",
                    "website_url": "https://rayco.test/",
                    "Trade": "Plumber",
                })
                writer.writerow({
                    "Company Name": "Onslow Contracting",
                    "verified_email": "skip@shop.test",
                    "status": "deliverable",
                    "website_url": "https://onslow.test/",
                    "Trade": "Civil Contracting",
                })
                writer.writerow({
                    "Company Name": "Dead Inbox",
                    "verified_email": "gone@shop.test",
                    "status": "invalid",
                    "website_url": "https://dead.test/",
                    "Trade": "Plumber",
                })
            sendable_path, unsendable_path = run_filter(
                src, Path(tmp) / "out", campaign_trade="plumber"
            )
            sendable = _load(sendable_path)
            unsendable = _load(unsendable_path)
        self.assertEqual([r["Company Name"] for r in sendable], ["Rayco Plumbing", "Dead Inbox"])
        reasons = {r["Company Name"]: r["exclusion_reason"] for r in unsendable}
        self.assertEqual(reasons["Onslow Contracting"], "disqualified_non_trade_or_civil")
        self.assertNotIn("Dead Inbox", reasons)

    def test_emails_json_and_accept_all(self):
        self.assertTrue(
            is_sendable_email({
                "title": "Pratt Plumbers",
                "emails": '["info@pratt.test"]',
                "status": "accept_all",
            })
        )

    def test_lead_status_is_not_verify_status(self):
        self.assertFalse(
            is_sendable_email({
                "business_name": "Rayco Plumbing",
                "email": "shane@rayco.test",
                "status": "interested",
            })
        )


class TestPaidDemandRequired(unittest.TestCase):
    def test_blank_paid_demand_walks(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "plumber-wave-202609.csv"
            with src.open("w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(
                    f,
                    fieldnames=[
                        "business_name",
                        "verified_email",
                        "email_status",
                        "trade",
                        "website",
                        "paid_demand",
                    ],
                )
                writer.writeheader()
                writer.writerow({
                    "business_name": "Rayco Plumbing",
                    "verified_email": "shane@rayco.test",
                    "email_status": "ok",
                    "trade": "Plumber",
                    "website": "https://rayco.test/",
                    "paid_demand": "",
                })
                writer.writerow({
                    "business_name": "Pratt Plumbers",
                    "verified_email": "ok@pratt.test",
                    "email_status": "ok",
                    "trade": "Plumber",
                    "website": "https://pratt.test/",
                    "paid_demand": "Hipages",
                })
                writer.writerow({
                    "business_name": "Meta Shop",
                    "verified_email": "ok@metashop.test",
                    "email_status": "ok",
                    "trade": "Plumber",
                    "website": "https://metashop.test/",
                    "paid_demand": "Meta Ads",
                })
                writer.writerow({
                    "business_name": "Review Shop",
                    "verified_email": "ok@review.test",
                    "email_status": "ok",
                    "trade": "Plumber",
                    "website": "https://review.test/",
                    "paid_demand": "16 google reviews",
                })
            sendable_path, unsendable_path = run_filter(
                src, Path(tmp) / "out", require_paid_demand=True
            )
            sendable = _load(sendable_path)
            unsendable = _load(unsendable_path)
        self.assertEqual(len(sendable), 2)
        names = {r["business_name"] for r in sendable}
        self.assertEqual(names, {"Pratt Plumbers", "Meta Shop"})
        reasons = {r["business_name"]: r["exclusion_reason"] for r in unsendable}
        self.assertEqual(reasons["Rayco Plumbing"], "missing_paid_demand")
        self.assertEqual(reasons["Review Shop"], "missing_paid_demand")

    def test_no_require_flag_sends_without_column(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "plumber-tag-202609.csv"
            with src.open("w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(
                    f,
                    fieldnames=["business_name", "verified_email", "email_status", "trade", "website"],
                )
                writer.writeheader()
                writer.writerow({
                    "business_name": "Rayco Plumbing",
                    "verified_email": "shane@rayco.test",
                    "email_status": "ok",
                    "trade": "Plumber",
                    "website": "https://rayco.test/",
                })
            sendable_path, _ = run_filter(
                src, Path(tmp) / "out", require_paid_demand=False
            )
            sendable = _load(sendable_path)
        self.assertEqual(len(sendable), 1)


    def test_roof_tilers_exempt_from_tiling_rule(self):
        roof_row = {
            "business_name": "Calajade Roof Tiling",
            "trade": "Roofing Contractor",
            "email": "info@calajaderoofing.com.au",
            "email_status": "ok",
        }
        self.assertIsNone(evaluate_anti_icp(roof_row, campaign_trade="roofing"))

    def test_bathroom_tilers_disqualified(self):
        tiler_row = {
            "business_name": "Sydney Quality Tilers",
            "trade": "Tiling and Renovation",
            "email": "info@sydneyqualitytilers.com.au",
            "email_status": "ok",
        }
        self.assertEqual(evaluate_anti_icp(tiler_row, campaign_trade="roofing"), "disqualified_non_trade_or_civil")


class TestIcpBeforeEmail(unittest.TestCase):
    def test_email_column_without_verified_email_still_filters(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "plumber-unmarked-202609.csv"
            with src.open("w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(
                    f,
                    fieldnames=["business_name", "Email", "email_status"],
                )
                writer.writeheader()
                writer.writerow({
                    "business_name": "Rayco Plumbing",
                    "Email": "shane@rayco.test",
                    "email_status": "ok",
                })
                writer.writerow({
                    "business_name": "Blank Inbox",
                    "Email": "",
                    "email_status": "",
                })
            sendable_path, unsendable_path = run_filter(src, Path(tmp) / "out")
            sendable = _load(sendable_path)
            unsendable = _load(unsendable_path)
        names = [r["business_name"] for r in sendable]
        self.assertEqual(names, ["Rayco Plumbing", "Blank Inbox"])
        self.assertEqual(unsendable, [])


if __name__ == "__main__":
    unittest.main()
