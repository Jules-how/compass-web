# Outbound companion source

Git-tracked copy of the local outbound worker, its Python dependencies, regression tests and operating instructions. Paths beneath this directory match their paths in the Switchflow workspace. The current deployed Compass API remains the lead ledger and approval authority.

The active Mac working files remain under `/Users/Jules/switchflow-os/`. `source-manifest.json` records the exact SHA-256 of each captured file. When changing those working files, update their corresponding tracked copies and hashes in the same change. This keeps the local execution path intact while making the complete source recoverable from Git. Copy only these explicitly listed files when restoring; review local differences before replacing anything.

## Run from this checkout

Python 3.11 or newer; standard library only. Supply `COMPASS_BASE_URL` and `COMPASS_AGENT_SECRET` through the environment. The usual workspace `.env.local` fallback is available only when files are restored to their original workspace layout. Never commit credentials.

```sh
python3 workers/outbound/cold-email/outbound_worker.py --campaign CELL --run RUN
```

The worker prepares a claimed ticket. Human approval, paused CSV import and live recipient reconciliation remain separate steps in [the runbook](../../docs/OUTBOUND_PREPARATION.md).

## Verify

```sh
python3 -m unittest discover -s workers/outbound/cold-email -p 'test_*.py'
python3 -m unittest discover -s workers/outbound/cold-email/openers -p 'test_*.py'
python3 -m unittest discover -s workers/outbound/cold-email/list-builds -p 'test_*.py'
python3 -m unittest discover -s workers/outbound/.agents/skills/instantly-load -p 'test_*.py'
SWITCHFLOW_WORKSPACE="$PWD/workers/outbound" node --test test/outbound-preparation.test.mjs
```

The six vertical files supply compatibility vocabulary used by the existing engine and its regression tests. The selected Compass offer, evidence and frozen campaign ticket govern current installation preparation. Lead exports, research records, verifier receipts and credentials are not source dependencies and stay outside this package.

Thirteen historical filter checks require private local CSVs and explicitly skip when those files are absent. They still run in the original workspace. Twenty synthetic filter checks and the worker, factory, opener and import checks run without private data.
