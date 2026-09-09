#!/usr/bin/env python3
"""Execute one immutable Compass preparation ticket with the existing opener engine.

python3 cold-email/outbound_worker.py --campaign CELL --run RUN
A failed or expired attempt is retryable; a completed run is an idempotent no-op.
This worker never writes Instantly or approves a batch.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import sys
from urllib.parse import urlencode
from pathlib import Path

from factory_job import load_config
from urllib.request import Request, urlopen
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parent / "openers"))
from generate_openers import render_preparation_ticket


def execute(campaign: str, run: str, request=None) -> dict:
    if request is None:
        base, secret = load_config()
        endpoint = base + "/api/agent/outbound/preparation?" + urlencode({"campaign_id": campaign})
        def request(body):
            req = Request(endpoint, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-compass-agent-secret": secret}, method="POST")
            try:
                with urlopen(req, timeout=60) as response:
                    return json.load(response)
            except HTTPError as exc:
                raise RuntimeError(f"Compass {exc.code}: {exc.read(4000).decode()}") from None
    ticket = request({"action": "claim", "run_id": run})
    if ticket["status"] == "ready":
        return {"status": "already_prepared", "run_id": run}
    token = ticket["lease_token"]
    outputs = render_preparation_ticket(ticket)
    request({"action": "heartbeat", "run_id": run, "token": token})
    # Keep a lease on an uncertain completion response. Retrying the same run is
    # safe after expiry; never mark a possibly committed completion as failed.
    return request({"action": "complete", "run_id": run, "token": token, "outputs": outputs})


def process_csv(campaign: str, path: Path, output: Path) -> dict:
    """Retain each source row, then render and read back every batch. Never approves or sends."""
    base, secret = load_config()
    endpoint = base + "/api/agent/outbound/preparation?" + urlencode({"campaign_id": campaign})
    def request(body=None):
        req = Request(endpoint, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type":"application/json", "x-compass-agent-secret":secret}, method="POST" if body is not None else "GET")
        try:
            with urlopen(req, timeout=60) as response: return json.load(response)
        except HTTPError as exc:
            raise RuntimeError(f"Compass {exc.code}: {exc.read(4000).decode()}") from None
    if path.stat().st_size > 20 * 1024 * 1024: raise ValueError("Input CSV exceeds 20 MB")
    with path.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or len(reader.fieldnames) != len(set(reader.fieldnames)): raise ValueError("CSV headers must be present and unique")
        rows = list(reader)
    if not rows: raise ValueError("CSV has no rows")
    source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    for i, row in enumerate(rows):
        if None in row or any(v is None for v in row.values()): raise ValueError(f"Malformed CSV at row {i+2}")
        row.update(source_file=path.name, source_sha256=source_hash, source_row=i+2)
        row["company"] = next((row.get(k, "").strip() for k in ["company","business_name","company_name","title","Business Name"] if row.get(k," ").strip()), "")
        row["website"] = row.get("website") or row.get("website_url") or row.get("Website", "")
        row["email"] = row.get("verified_email") or row.get("email") or row.get("Email") or row.get("published_email", "")
        for key in ["evidence","verification","contact_basis","geography_review"]:
            if row.get(key):
                try: row[key] = json.loads(row[key])
                except ValueError: raise ValueError(f"Row {i+2}: invalid JSON in {key}") from None
            else: row.pop(key, None)
        row["identity_reviewed"] = str(row.get("identity_reviewed", "")).lower() == "true"
    output.mkdir(parents=True, exist_ok=True)
    records, receipts = [], []
    for start in range(0,len(rows),200):
        run = request({"action":"create","rows":rows[start:start+200]})
        execute(campaign, run["id"], request)
        state = request()
        prep = next((p for p in state["preparations"] if p["run_id"] == run["id"]), None)
        if prep is None: raise RuntimeError("Completed output was not returned by Compass")
        bundle = prep["bundle"]
        if bundle["counts"]["total"] != len(rows[start:start+200]): raise RuntimeError("Input/output row count mismatch")
        (output / (prep["id"]+".json")).write_text(json.dumps(prep, indent=2))
        records.extend(bundle["records"])
        receipts.append({"run_id":run["id"],"preparation_id":prep["id"],"hash":bundle["hash"],"counts":bundle["counts"]})
    fields=["company","email","status","reasons","signal","opener","subject","email_1","email_2","evidence","verification"]
    with (output/"review-output.csv").open("w",newline="",encoding="utf-8") as stream:
        writer=csv.DictWriter(stream, fieldnames=fields);writer.writeheader()
        for r in records:
            rendered=r.get("rendered") or {}; values=rendered.get("values",{});steps=rendered.get("steps",[]);c=r["candidate"]
            row={"company":c["company"],"email":c["email"],"status":r["status"],"reasons":"; ".join(r["reasons"]),"signal":values.get("signal_label",""),"opener":values.get("opener",""),"subject":values.get("subject",""),"email_1":steps[0]["body"] if steps else "","email_2":steps[1]["body"] if len(steps)>1 else "","evidence":json.dumps(c["evidence"]),"verification":json.dumps(c.get("verification"))}
            writer.writerow({k:("'"+v if isinstance(v,str) and v.startswith(("=","+","-","@","\t","\r")) else v) for k,v in row.items()})
    result={"source":path.name,"source_sha256":source_hash,"input_rows":len(rows),"output_rows":len(records),"runs":receipts,"review_csv":str((output/"review-output.csv").resolve())}
    (output/"receipt.json").write_text(json.dumps(result,indent=2))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--campaign", required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--run")
    group.add_argument("--input-csv", type=Path)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    try:
        if args.input_csv and not args.output_dir: raise ValueError("--output-dir is required with --input-csv")
        result = process_csv(args.campaign, args.input_csv, args.output_dir) if args.input_csv else execute(args.campaign,args.run)
        print(json.dumps(result, indent=2))
        return 0
    except (RuntimeError, OSError, KeyError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
