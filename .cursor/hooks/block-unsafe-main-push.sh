#!/usr/bin/env bash
# Block `git push` when deploy guards fail (illegal route exports / untracked imports).
# Full Next build still runs on Vercel + GitHub Actions; this is the fast local gate.
set -euo pipefail

input=$(cat)
command=$(printf '%s' "$input" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.command||''))}catch{}})")

# Only gate pushes (matcher already filters, but be explicit).
if ! printf '%s' "$command" | grep -Eq '(^|[[:space:];|&])git[[:space:]]+push([[:space:]]|$)'; then
  printf '%s\n' '{"permission":"allow"}'
  exit 0
fi

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$root"

if ! node scripts/check-deploy-guards.mjs >/tmp/compass-deploy-guards.out 2>/tmp/compass-deploy-guards.err; then
  detail=$(cat /tmp/compass-deploy-guards.err /tmp/compass-deploy-guards.out 2>/dev/null | tr '\n' ' ' | head -c 1200)
  node -e '
    const detail = process.argv[1] || "Deploy guards failed. Run: npm run verify"
    const payload = {
      permission: "deny",
      user_message: "Blocked git push: deploy guards failed. Run npm run verify.",
      agent_message: `Blocked git push until deploy guards pass. ${detail} Run: npm run verify`
    }
    process.stdout.write(JSON.stringify(payload))
  ' "$detail"
  exit 0
fi

printf '%s\n' '{"permission":"allow"}'
exit 0
