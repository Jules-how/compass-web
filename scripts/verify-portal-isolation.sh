#!/usr/bin/env bash
set -euo pipefail

required=(PORTAL_DATABASE_URL PORTAL_TEST_OPERATOR_USER PORTAL_TEST_TENANT_A_USER PORTAL_TEST_TENANT_B_USER)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing ${name}; run only against a disposable Supabase branch." >&2
    exit 2
  fi
done

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required for the live tenant-isolation suite." >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="${SCRIPT_DIR}/../../../supabase/tests/portal/tenant_isolation.sql"

psql "${PORTAL_DATABASE_URL}" \
  --set=operator_user="${PORTAL_TEST_OPERATOR_USER}" \
  --set=tenant_a_user="${PORTAL_TEST_TENANT_A_USER}" \
  --set=tenant_b_user="${PORTAL_TEST_TENANT_B_USER}" \
  --file="${SQL_FILE}"
