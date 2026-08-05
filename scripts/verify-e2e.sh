#!/bin/bash
# End-to-end verification for Compass-Web Lite bidirectional sync.
# Checks Supabase state from the cloud pod. Does NOT verify Compass desktop
# (Electron can't run on Linux — see SLICE6-VERIFICATION.md for manual Mac steps).
#
# Prerequisites:
#   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
#   - Migrations 0005 + 0006 applied (run automation/bin/apply-supabase-migrations.sh)
#
# Usage:
#   SUPABASE_URL='...' SUPABASE_SERVICE_ROLE_KEY='...' \
#   bash apps/compass-web/scripts/verify-e2e.sh <scenario> <arg>
#
# Scenarios:
#   task-created <title>       — verify a task with the title exists in compass_tasks
#   lead-uploaded <batch-id>   — verify a lead import batch + source rows + contacts
#   lead-count <min-count>     — verify lead_contacts has at least min-count rows

set -euo pipefail

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set." >&2
  exit 1
fi

SCENARIO="${1:-}"
ARG="${2:-}"

if [ -z "${SCENARIO}" ]; then
  echo "Usage: $0 <scenario> <arg>" >&2
  echo "Scenarios: task-created <title> | lead-uploaded <batch-id> | lead-count <min-count>" >&2
  exit 1
fi

# Execute a SQL query against Supabase and return the JSON result.
query_sql() {
  local sql="$1"
  curl -sS -X POST "${SUPABASE_URL}/pg/query" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(printf '%s' "${sql}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}"
}

# Extract a single value from the first row of a query result.
query_scalar() {
  local sql="$1"
  query_sql "${sql}" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    if isinstance(d, list) and d:
        row = d[0]
        if isinstance(row, dict):
            print(next(iter(row.values())))
        else:
            print(row)
    else:
        print("ERR")
except Exception:
    print("ERR")
'
}

case "${SCENARIO}" in
  task-created)
    TITLE="${ARG}"
    if [ -z "${TITLE}" ]; then
      echo "FATAL: task-created requires a title argument" >&2
      exit 1
    fi
    echo "Verifying task with title '${TITLE}' exists in compass_tasks..."
    COUNT=$(query_scalar "select count(*) as cnt from public.compass_tasks where title = $(printf '%s' "${TITLE}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")
    if [ "${COUNT}" = "ERR" ]; then
      echo "FAIL: could not query compass_tasks (migration 0006 not applied?)" >&2
      exit 1
    fi
    if [ "${COUNT}" -ge 1 ] 2>/dev/null; then
      echo "PASS: task found (count=${COUNT})"
      # Show the task details
      query_sql "select id, title, status, created_at, mirrored_at from public.compass_tasks where title = $(printf '%s' "${TITLE}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))') order by mirrored_at desc limit 1" | python3 -m json.tool
      exit 0
    else
      echo "FAIL: task not found (count=${COUNT})" >&2
      exit 1
    fi
    ;;
  lead-uploaded)
    BATCH_ID="${ARG}"
    if [ -z "${BATCH_ID}" ]; then
      echo "FATAL: lead-uploaded requires a batch-id argument" >&2
      exit 1
    fi
    echo "Verifying lead import batch ${BATCH_ID}..."
    BATCH_COUNT=$(query_scalar "select count(*) as cnt from public.lead_import_batches where id = $(printf '%s' "${BATCH_ID}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")
    SOURCE_COUNT=$(query_scalar "select count(*) as cnt from public.lead_source_rows where batch_id = $(printf '%s' "${BATCH_ID}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")
    CONTACT_COUNT=$(query_scalar "select count(*) as cnt from public.lead_contacts where import_batch_id = $(printf '%s' "${BATCH_ID}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")
    echo "  lead_import_batches: ${BATCH_COUNT}"
    echo "  lead_source_rows:    ${SOURCE_COUNT}"
    echo "  lead_contacts:       ${CONTACT_COUNT}"
    if [ "${BATCH_COUNT}" -ge 1 ] 2>/dev/null && [ "${SOURCE_COUNT}" -ge 1 ] 2>/dev/null && [ "${CONTACT_COUNT}" -ge 1 ] 2>/dev/null; then
      echo "PASS: batch ${BATCH_ID} verified"
      exit 0
    else
      echo "FAIL: batch ${BATCH_ID} incomplete or missing" >&2
      exit 1
    fi
    ;;
  lead-count)
    MIN_COUNT="${ARG}"
    if [ -z "${MIN_COUNT}" ]; then
      echo "FATAL: lead-count requires a min-count argument" >&2
      exit 1
    fi
    echo "Verifying lead_contacts has at least ${MIN_COUNT} rows..."
    COUNT=$(query_scalar "select count(*) as cnt from public.lead_contacts")
    if [ "${COUNT}" = "ERR" ]; then
      echo "FAIL: could not query lead_contacts (migration 0005 not applied?)" >&2
      exit 1
    fi
    if [ "${COUNT}" -ge "${MIN_COUNT}" ] 2>/dev/null; then
      echo "PASS: lead_contacts has ${COUNT} rows (>= ${MIN_COUNT})"
      exit 0
    else
      echo "FAIL: lead_contacts has ${COUNT} rows (< ${MIN_COUNT})" >&2
      exit 1
    fi
    ;;
  *)
    echo "Unknown scenario: ${SCENARIO}" >&2
    echo "Scenarios: task-created <title> | lead-uploaded <batch-id> | lead-count <min-count>" >&2
    exit 1
    ;;
esac
