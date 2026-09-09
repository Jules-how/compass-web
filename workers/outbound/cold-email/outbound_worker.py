#!/usr/bin/env python3
"""Execute one immutable Compass preparation ticket with the existing opener engine.

python3 cold-email/outbound_worker.py --campaign CELL --run RUN
A failed or expired attempt is retryable; a completed run is an idempotent no-op.
This worker never writes Instantly or approves a batch.
"""
from __future__ import annotations
import argparse
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--campaign", required=True)
    parser.add_argument("--run", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(execute(args.campaign, args.run), indent=2))
        return 0
    except (RuntimeError, OSError, KeyError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
