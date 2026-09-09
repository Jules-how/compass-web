#!/usr/bin/env python3
"""Signal Waterfall tests.

  Tier 1: Paid Demand (Hipages, Google Ads, Meta Ads)
  Tier 2: High-Margin Specialty
  Tier 3: Fallback on the campaign trade noun
"""

from __future__ import annotations

import csv
import json
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

HERE = Path(__file__).resolve().parent
_COLD_EMAIL = HERE.parent
if str(_COLD_EMAIL) not in sys.path:
    sys.path.insert(0, str(_COLD_EMAIL))

from generate_openers import (
    TIER_FALLBACK,
    TIER_PAID,
    TIER_SPECIALTY,
    casualise_company,
    clean_first_name,
    parse_raw_data,
    process_csv,
    process_row,
    spec_violations,
    team_core,
)
from vertical_spec import load_all_verticals, specialties_for_trade, vertical_for_trade


def raw(**kwargs) -> str:
    return json.dumps(kwargs)


def lead(**overrides) -> dict:
    row = {
        "business_name": "Acme Plumbing",
        "city": "Fairfield West",
        "suburb": "",
        "first_name": "",
        "last_name": "",
        "primary_email": "info@acme.test",
        "email_status": "ok",
        "email_quality": "good",
        "hours_claim": "",
        "hours": "",
        "services": "",
        "specialty": "",
        "trade": "",
        "review_count": "3",
        "website": "https://acme.test",
        "raw_data": raw(city=overrides.get("city") or "Fairfield West"),
    }
    row.update(overrides)
    return row


def generate(row: dict, trade: str = "plumber", city: str = "sydney") -> dict:
    return process_row(row, trade, city)


class TestTwoTiers(unittest.TestCase):
    def test_tier_1_paid_demand_hipages(self):
        row = lead(
            business_name="Currambine Plumbing",
            city="Perth",
            suburb="Currambine",
            paid_demand="Hipages",
            services="General plumbing",
            trade="Plumbing",
            raw_data=raw(city="Currambine"),
        )
        out = generate(row, "plumber", "perth")
        self.assertEqual(out["signal_tier"], TIER_PAID)
        self.assertIn("is on Hipages around Currambine", out["opener"])
        self.assertNotIn("voicemail", out["opener"])
        self.assertEqual(out["subject"], "currambine hipages jobs")
        self.assertFalse(spec_violations(out, row, campaign_trade="plumber"))

    def test_tier_1_paid_demand_google_ads(self):
        row = lead(
            business_name="A-Grade Roofing",
            city="Sydney",
            suburb="Ashfield",
            paid_demand="Google Ads",
            services="Roof repairs",
            trade="Roofing",
            raw_data=raw(city="Ashfield"),
        )
        out = generate(row, "roofing", "sydney")
        self.assertEqual(out["signal_tier"], TIER_PAID)
        self.assertIn("runs Google ads around Ashfield", out["opener"])
        self.assertNotIn("voicemail", out["opener"])
        self.assertEqual(out["subject"], "ashfield google ads jobs")
        self.assertFalse(spec_violations(out, row, campaign_trade="roofing"))

    def test_tier_1_paid_demand_meta_ads(self):
        row = lead(
            business_name="Ashfield Roofing",
            city="Sydney",
            suburb="Ashfield",
            paid_demand="Meta Ads",
            services="Roof repairs",
            trade="Roofing",
            raw_data=raw(city="Ashfield"),
        )
        out = generate(row, "roofing", "sydney")
        self.assertEqual(out["signal_tier"], TIER_PAID)
        self.assertIn("runs Meta ads around Ashfield", out["opener"])
        self.assertNotIn("voicemail", out["opener"])
        self.assertEqual(out["subject"], "ashfield meta ads jobs")
        self.assertFalse(spec_violations(out, row, campaign_trade="roofing"))

    def test_plain_google_reviews_are_not_paid_demand(self):
        row = lead(
            business_name="Shepherd Industries",
            city="Jimboomba",
            suburb="Jimboomba",
            review_count="16",
            trade="Electrical Contractor",
            raw_data=raw(city="Jimboomba"),
        )
        out = generate(row, "electrical", "gold coast")
        self.assertNotEqual(out["signal_tier"], TIER_PAID)
        self.assertNotIn("Google ads", out["opener"])
        self.assertEqual(out["signal_tier"], TIER_FALLBACK)
        self.assertIn("taking electrical jobs in Jimboomba", out["opener"])
        self.assertTrue(out["sendable"])
        self.assertFalse(spec_violations(out, row, campaign_trade="electrical"))

    def test_tier_2_specialty_gas_fitting(self):
        row = lead(
            business_name="Diverse Drainage and Plumbing Contractors",
            city="Wangara",
            first_name="Mark",
            services="Commercial plumbing and gas fitting solutions",
            raw_data=raw(
                city="Wangara",
                tags=["plumber", "gasfitter"],
                staffs=[{"name": "Mark", "role": "Owner"}],
            ),
        )
        out = generate(row, "plumber", "perth")
        self.assertEqual(out["signal_tier"], TIER_SPECIALTY)
        self.assertTrue(out["opener"].startswith("Hi Mark, saw "))
        self.assertIn("handles gas fitting work across Wangara.", out["opener"])
        self.assertEqual(out["subject"], "wangara gas fitting jobs")
        self.assertFalse(spec_violations(out, row, campaign_trade="plumber"))

    def test_tier_2_specialty_roof_leak(self):
        row = lead(
            business_name="Rosella Roofing Sydney",
            city="Sydney",
            suburb="Ultimo",
            services="Emergency roof leak repairs",
            trade="Roofing",
            raw_data=raw(city="Ultimo"),
        )
        out = generate(row, "roofing", "sydney")
        self.assertEqual(out["signal_tier"], TIER_SPECIALTY)
        self.assertIn("handles roof leak work across Ultimo.", out["opener"])
        self.assertEqual(out["subject"], "ultimo roof leak jobs")
        self.assertFalse(spec_violations(out, row, campaign_trade="roofing"))

    def test_tier_2_specialty_switchboards(self):
        row = lead(
            business_name="Spark Right Electrical",
            city="Sydney",
            suburb="Parramatta",
            first_name="Dave",
            services="Switchboard upgrades and commercial wiring",
            trade="Electrical",
            raw_data=raw(city="Parramatta"),
        )
        out = generate(row, "electrical", "sydney")
        self.assertEqual(out["signal_tier"], TIER_SPECIALTY)
        self.assertTrue(out["opener"].startswith("Hi Dave, saw "))
        self.assertIn("handles switchboard upgrades across Parramatta.", out["opener"])
        self.assertEqual(out["subject"], "parramatta switchboard upgrades jobs")
        self.assertFalse(spec_violations(out, row, campaign_trade="electrical"))

    def test_fallback_when_no_paid_demand_or_specialty(self):
        row = lead(
            business_name="Casotti Electrical",
            city="Perth",
            suburb="Wangara",
            first_name="Domenic",
            review_count="490",
            trade="Electrical",
            raw_data=raw(city="Wangara"),
        )
        out = generate(row, "electrical", "perth")
        self.assertEqual(out["signal_tier"], TIER_FALLBACK)
        self.assertTrue(out["opener"].startswith("Hi Domenic, saw "))
        self.assertIn("taking electrical jobs in Wangara", out["opener"])
        self.assertEqual(out["subject"], "wangara electrical jobs")
        self.assertTrue(out["sendable"])
        self.assertFalse(spec_violations(out, row, campaign_trade="electrical"))

    def test_unknown_email_stays_sendable(self):
        row = lead(
            business_name="Casotti Electrical",
            suburb="Wangara",
            email_status="unknown",
            email_quality="risky",
            raw_data=raw(city="Wangara"),
        )
        out = generate(row, "electrical", "perth")
        self.assertTrue(out["sendable"])
        self.assertEqual(out["signal_tier"], TIER_FALLBACK)

    def test_status_is_required_even_for_verified_named_column(self):
        for quality in ("", "good", "risky"):
            row = lead(verified_email="pending@shop.test", email_status="", email_quality=quality)
            self.assertFalse(generate(row)["sendable"])

    def test_compass_verification_status_is_accepted(self):
        row = lead(email_status="", email_quality="", email_verify_status="valid")
        self.assertTrue(generate(row)["sendable"])

    def test_existing_outreach_and_suppression_are_not_sendable(self):
        for status in ("in_instantly", "not_interested", "suppressed", "interested"):
            self.assertFalse(generate(lead(outbound_status=status))["sendable"])

    def test_invalid_email_is_unsendable(self):
        row = lead(
            business_name="Casotti Electrical",
            suburb="Wangara",
            email_status="invalid",
            email_quality="bad",
            raw_data=raw(city="Wangara"),
        )
        out = generate(row, "electrical", "perth")
        self.assertFalse(out["sendable"])

    def test_hvac_ducted_from_vertical_spec(self):
        row = lead(
            business_name="Shire Air Conditioning",
            suburb="Gymea",
            services="Ducted air conditioning installs",
            raw_data=raw(city="Gymea"),
        )
        out = generate(row, "hvac", "sydney")
        self.assertEqual(out["signal_tier"], TIER_SPECIALTY)
        self.assertIn("handles ducted air conditioning work across Gymea.", out["opener"])
        self.assertEqual(out["subject"], "gymea ducted air conditioning jobs")
        self.assertEqual(out["companyShort"], "Shire Air")
        self.assertEqual(out["service"], "ducted air conditioning")
        self.assertEqual(out["Opener"], out["opener"])
        self.assertFalse(spec_violations(out, row, campaign_trade="hvac"))

    def test_specialty_stays_on_this_trade(self):
        row = lead(
            business_name="Spark Right Electrical",
            suburb="Parramatta",
            services="Switchboard upgrades",
            raw_data=raw(city="Parramatta"),
        )
        as_electrical = generate(row, "electrical", "sydney")
        as_plumber = generate(row, "plumber", "sydney")
        self.assertEqual(as_electrical["signal_tier"], TIER_SPECIALTY)
        self.assertEqual(as_plumber["signal_tier"], TIER_FALLBACK)
        self.assertIn("taking plumbing jobs in Parramatta", as_plumber["opener"])
        self.assertNotIn("switchboard", as_plumber["opener"].lower())
        self.assertTrue(as_plumber["sendable"])

    def test_hvac_shop_sign_is_not_specialty(self):
        row = lead(
            business_name="Murray Heating and Cooling",
            city="Adelaide",
            suburb="Adelaide",
            services="Residential heating and cooling",
            trade="Air Conditioning Services",
            raw_data=raw(city="Adelaide"),
        )
        out = generate(row, "hvac", "adelaide")
        self.assertEqual(out["signal_tier"], TIER_SPECIALTY)
        # Column-first: the services cell speaks "heating" (shop's own order),
        # not the trade-blob "air conditioning". The sign phrase "heating and
        # cooling" as a whole is still never spoken.
        self.assertIn("handles heating work across Adelaide.", out["opener"])
        self.assertNotIn("heating and cooling work", out["opener"])
        self.assertEqual(casualise_company(row["business_name"]), "Murray")

    def test_locksmith_short_stamp_is_specialty(self):
        row = lead(
            business_name="Dave Locks",
            suburb="Liverpool",
            specialty="lockout; rekey",
            raw_data=raw(city="Liverpool"),
        )
        out = generate(row, "locksmith", "sydney")
        self.assertEqual(out["signal_tier"], TIER_SPECIALTY)
        self.assertIn("lockouts across Liverpool.", out["opener"])
        self.assertNotIn("lockout work", out["opener"])

    def test_locksmith_maps_emergency_category_is_specialty(self):
        row = lead(
            business_name="Night Van Locks",
            suburb="Parramatta",
            specialty="",
            categoryName="Emergency locksmith service",
            raw_data=raw(city="Parramatta"),
        )
        out = generate(row, "locksmith", "sydney")
        self.assertEqual(out["signal_tier"], TIER_SPECIALTY)
        self.assertIn("emergency lockouts across Parramatta.", out["opener"])
        self.assertNotIn("emergency locksmith service", out["opener"].lower())
        self.assertEqual(out["service"], "emergency lockouts")
        self.assertEqual(out["subject"], "parramatta emergency lockout jobs")


class TestColumnFirstSpecialty(unittest.TestCase):
    def test_shop_order_beats_vertical_keyword_order(self):
        row = lead(
            business_name="Spark Right Electrical",
            suburb="Parramatta",
            specialty="lighting; fault finding; switchboards",
            services="Switchboard upgrades and commercial wiring",
            trade="Electrical",
            raw_data=raw(city="Parramatta"),
        )
        out = generate(row, "electrical", "sydney")
        self.assertEqual(out["signal_tier"], TIER_SPECIALTY)
        self.assertEqual(out["service"], "lighting")
        self.assertIn("handles lighting across Parramatta.", out["opener"])
        self.assertNotIn("switchboard", out["opener"].lower())
        self.assertFalse(spec_violations(out, row, campaign_trade="electrical"))

    def test_paid_demand_still_wins_over_columns(self):
        row = lead(
            business_name="Currambine Plumbing",
            suburb="Currambine",
            paid_demand="Hipages",
            specialty="gas fitting; blocked drains",
            raw_data=raw(city="Currambine"),
        )
        out = generate(row, "plumber", "perth")
        self.assertEqual(out["signal_tier"], TIER_PAID)
        self.assertIn("Hipages", out["opener"])
        self.assertFalse(spec_violations(out, row, campaign_trade="plumber"))

    def test_empty_columns_keep_blob_specialty(self):
        row = lead(
            business_name="Night Van Locks",
            suburb="Parramatta",
            specialty="",
            services="",
            categoryName="Emergency locksmith service",
            raw_data=raw(city="Parramatta"),
        )
        out = generate(row, "locksmith", "sydney")
        self.assertEqual(out["signal_tier"], TIER_SPECIALTY)
        self.assertIn("emergency lockouts across Parramatta.", out["opener"])

    def test_column_phrase_without_keyword_moves_on(self):
        row = lead(
            business_name="Dave Locks",
            suburb="Liverpool",
            specialty="master key systems; rekey",
            raw_data=raw(city="Liverpool"),
        )
        out = generate(row, "locksmith", "sydney")
        self.assertEqual(out["signal_tier"], TIER_SPECIALTY)
        self.assertIn("rekeying across Liverpool.", out["opener"])

    def test_no_column_or_blob_specialty_is_fallback(self):
        row = lead(
            business_name="Casotti Electrical",
            suburb="Wangara",
            specialty="",
            services="",
            trade="Electrical",
            raw_data=raw(city="Wangara"),
        )
        out = generate(row, "electrical", "perth")
        self.assertEqual(out["signal_tier"], TIER_FALLBACK)
        self.assertIn("taking electrical jobs in Wangara", out["opener"])


class TestNameAndCompanyCleaning(unittest.TestCase):
    def test_slogan_shop_uses_second_person(self):
        row = lead(
            business_name="I Should Be Your Plumber",
            city="Perth",
            suburb="Perth",
            first_name="",
            services="Hot water systems",
        )
        out = generate(row, "plumber", "perth")
        self.assertIn("Saw you handle hot water work across Perth.", out["opener"])
        self.assertNotIn("I Should Be Your Plumber", out["opener"].split("\n\n")[-1])

    def test_person_company_uses_second_person(self):
        row = lead(
            business_name="James Folly Airconditioning",
            first_name="Jamie",
            last_name="Hughes",
            city="Melbourne",
            suburb="Keysborough",
            trade="aircon",
            services="Split system installs",
        )
        out = generate(row, "hvac", "melbourne")
        self.assertIn("Hi Jamie, saw you handle split system work across Keysborough.", out["opener"])
        self.assertNotIn("James Folly", out["opener"].split("\n\n")[-1])

    def test_placeholder_firstname_cleaned(self):
        row = lead(
            business_name="FRM Refrigeration",
            suburb="Winnellie",
            first_name="FRM team",
            services="Cool room repairs",
        )
        out = generate(row, "hvac", "darwin")
        self.assertEqual(out["firstName"], "")
        self.assertFalse(out["opener"].startswith("Hi "))
        self.assertTrue(out["opener"].startswith("Saw FRM"))

    def test_page_copy_junk_is_not_a_firstname(self):
        for junk in ("Hi", "Read", "Privacy", "Testimonials", "Expert", "Areas"):
            row = lead(
                business_name="LCL Plumbing",
                suburb="Hillside",
                first_name=junk,
                services="Leak detection",
            )
            out = generate(row, "plumber", "melbourne")
            self.assertEqual(out["firstName"], "", junk)
            self.assertTrue(out["opener"].startswith("Saw "), junk)

    def test_slogan_firstname_not_a_person(self):
        row = lead(
            business_name="CST Electrical",
            suburb="Canning Vale",
            first_name="Australian",
            primary_email="admin@cstelectricalwa.test",
            verified_email="admin@cstelectricalwa.test",
            services="Safety switches",
            trade="electrical",
        )
        out = generate(row, "electrical", "perth")
        self.assertEqual(out["firstName"], "")
        self.assertTrue(out["opener"].startswith("Saw "))
        self.assertNotIn("Hi Australian", out["opener"])

    def test_company_first_token_is_not_a_person(self):
        row = lead(
            business_name="Mason Electrical Engineering",
            suburb="Neerabup",
            first_name="Mason",
            primary_email="admin@meec.test",
            verified_email="admin@meec.test",
            services="Fault finding",
            trade="electrical",
        )
        out = generate(row, "electrical", "perth")
        self.assertEqual(out["firstName"], "")
        self.assertTrue(out["opener"].startswith("Saw "))
        self.assertNotIn("Hi Mason", out["opener"])

    def test_email_local_does_not_establish_person_name(self):
        row = lead(
            business_name="Rayco Plumbing",
            city="Balcatta",
            first_name="",
            primary_email="shane@raycoplumbing.com.au",
            services="Hot water systems",
        )
        out = generate(row, "plumber", "perth")
        self.assertEqual(out["firstName"], "")
        self.assertTrue(out["opener"].startswith("Saw "))

    def test_casualise_spec_examples(self):
        cases = {
            "Diverse Drainage and Plumbing Contractors": "Diverse",
            "Rayco Plumbing": "Rayco Plumbing",
            "Pratt Plumbers": "Pratt Plumbers",
            "Swift Flow Pty Ltd": "Swift Flow",
            "All Kind Gas & Plumbing Brisbane": "All Kind",
            "WPS PLUMBING & LEAK DETECTION": "WPS",
            "Complete Air Conditioning & Refrigeration": "Complete Air",
            "Florance Electrical": "Florance Electrical",
        }
        for raw_name, expected in cases.items():
            self.assertEqual(casualise_company(raw_name), expected, raw_name)
        self.assertEqual(team_core("Rayco Plumbing"), "Rayco")
        self.assertEqual(team_core("Diverse"), "Diverse")


class TestOrigamiHeaders(unittest.TestCase):
    def test_title_case_reshape_columns(self):
        row = {
            "Business Name": "Shepherd Industries",
            "City": "Jimboomba",
            "Suburb": "Jimboomba",
            "First Name": "Ben",
            "Last Name": "",
            "Email": "ben@shepherd.test",
            "Email Status": "valid",
            "Review Count": "16",
            "Trade": "Electrical Contractor",
            "Services": "Switchboard upgrades",
            "Specialty": "Domestic electrical services",
            "Raw Data": raw(
                city="Jimboomba",
                staffs=[{"name": "Ben", "role": "owner"}],
            ),
        }
        out = generate(row, "electrical", "gold coast")
        self.assertEqual(out["firstName"], "Ben")
        self.assertEqual(out["signal_tier"], TIER_SPECIALTY)
        self.assertIn("Jimboomba", out["opener"])
        self.assertIn("switchboard upgrades across Jimboomba", out["opener"])
        self.assertTrue(out["opener"].startswith("Hi Ben, saw "))
        self.assertTrue(out["sendable"])
        self.assertFalse(spec_violations(out, row, campaign_trade="electrical"))


class TestIncomingSheetShapes(unittest.TestCase):
    def test_company_name_work_email_website_url(self):
        row = {
            "Company Name": "Currambine Plumbing",
            "work_email": "ok@currambine.test",
            "status": "valid",
            "website_url": "https://currambine.test/",
            "Suburb": "Currambine",
            "paid_demand": "Hipages",
            "Raw Data": raw(city="Currambine"),
        }
        out = generate(row, "plumber", "perth")
        self.assertEqual(out["signal_tier"], TIER_PAID)
        self.assertIn("Currambine", out["opener"])
        self.assertTrue(out["sendable"])
        self.assertFalse(spec_violations(out, row, campaign_trade="plumber"))

    def test_maps_title_and_emails_list(self):
        row = {
            "title": "United Air Conditioning",
            "emails": '["shop@united.test"]',
            "email_status": "valid",
            "city": "Berrimah",
            "review_count": "5",
            "trade": "Air Conditioning",
            "services": "Split system repairs",
            "raw_data": raw(city="Berrimah"),
        }
        out = generate(row, "hvac", "darwin")
        self.assertEqual(out["signal_tier"], TIER_SPECIALTY)
        self.assertIn("United", out["opener"])
        self.assertTrue(out["sendable"])


class TestVerticalSpecOwner(unittest.TestCase):
    def test_every_vertical_has_identity_and_shop_sign(self):
        specs = load_all_verticals()
        flags = {flag for spec in specs for flag in spec.trade_flags}
        for needed in ("plumber", "hvac", "electrical", "roofing", "pest", "locksmith"):
            self.assertIn(needed, flags)
        for spec in specs:
            self.assertTrue(spec.identity, spec.path)
            self.assertTrue(spec.shop_sign_words, spec.path)
            self.assertTrue(spec.specialties, spec.path)
            self.assertTrue(spec.trade_nouns, spec.path)

    def test_hvac_does_not_treat_heating_and_cooling_as_specialty(self):
        specs = specialties_for_trade("hvac")
        self.assertNotIn("heating and cooling", specs)
        self.assertIn("heating", specs)
        self.assertIn("air conditioning", specs)
        self.assertIn("ventilation", specs)
        hvac = vertical_for_trade("hvac")
        self.assertIn("Heating and Cooling", hvac.shop_sign_phrases)

    def test_plumber_aliases_live_on_plumbing_spec(self):
        plumbing = vertical_for_trade("plumber")
        self.assertTrue(plumbing.aliases)
        self.assertIn("i should be your plumber", plumbing.slogans)


class TestResolvedSuburbStamped(unittest.TestCase):
    def test_suburb_column_matches_spoken_opener(self):
        row = lead(
            business_name="Rosella Roofing Sydney",
            city="Sydney",
            suburb="Ultimo",
            services="Emergency roof leak repairs",
            raw_data=raw(city="Ultimo"),
        )
        out = generate(row, "roofing", "sydney")
        self.assertEqual(out["suburb"], "Ultimo")
        self.assertIn("Ultimo", out["opener"])
        self.assertTrue(out["subject"].startswith("ultimo"))

    def test_metro_city_column_falls_through_to_raw_suburb(self):
        row = lead(
            business_name="Heritage Plumbing Group",
            city="Reservoir",
            suburb="",
            services="Leak detection",
            raw_data=raw(city="Reservoir"),
        )
        out = generate(row, "plumber", "melbourne")
        self.assertEqual(out["suburb"], "Reservoir")
        self.assertIn("Reservoir", out["opener"])


class TestVerifiedEmailGate(unittest.TestCase):
    def test_archived_suppressed_and_review_rows_stay_out(self):
        for flags in ({"is_archived": True}, {"recontact_ok": 0}, {"suppression_reason": "opt out"}, {"icp_status": "skip"}, {"eligibility_reason": "website_identity_review"}):
            with self.subTest(flags=flags):
                out = process_row({"company": "Rayco Plumbing", "verified_email": "info@rayco.test", "email_status": "valid", "outbound_status": "uncontacted", "suburb": "Fairfield", **flags}, "plumber", "sydney")
                self.assertFalse(out["sendable"])

    def test_compass_refill_keeps_saved_specialty_order(self):
        out = process_row({
            "company": "Rayco Plumbing", "verified_email": "info@rayco.test",
            "email_verify_status": "valid", "outbound_status": "uncontacted",
            "city": "Fairfield", "lead_facts": json.dumps([
                {"kind": "specialty", "claim": "hot water; leak detection", "url": "https://rayco.test"}
            ]),
        }, "plumber", "sydney")
        self.assertTrue(out["sendable"])
        self.assertEqual(out["service"], "hot water")

    def test_verified_duplicate_inboxes_are_not_sent_twice(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "input.csv"
            rows = [dict(business_name="Rayco Plumbing", verified_email=email,
                         email_status="valid", outbound_status="uncontacted", suburb="Fairfield",
                         services="hot water") for email in ("info@rayco.test", "INFO@rayco.test")]
            with src.open("w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            with patch("generate_openers.SCRIPT_DIR", Path(tmp)):
                send, unsend, n, skipped = process_csv(src, "plumber", "sydney", "20260907")
            self.assertEqual((n, skipped), (1, 1))
            with unsend.open() as f:
                self.assertEqual(next(csv.DictReader(f))["verification_reason"], "duplicate_email")

    def test_process_csv_requires_verified_email(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "plumber-sydney-unmarked.csv"
            with src.open("w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(
                    f,
                    fieldnames=["business_name", "Email", "email_status", "suburb", "services"],
                )
                writer.writeheader()
                writer.writerow({
                    "business_name": "Rayco Plumbing",
                    "Email": "shane@rayco.test",
                    "email_status": "ok",
                    "suburb": "Fairfield West",
                    "services": "hot water",
                })
            with self.assertRaises(SystemExit) as raised:
                process_csv(src, "plumber", "sydney", "20260902")
            self.assertIn("verified_email", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
