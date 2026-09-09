import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

const appRoot = new URL('../src/app/', import.meta.url)

function filesUnder(directory) {
  const path = directory.pathname
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name)
    return statSync(child).isDirectory() ? filesUnder(new URL(`file://${child}/`)) : [child]
  })
}

test('customer and legacy operator data routes never import a service-role client', () => {
  const offenders = filesUnder(appRoot)
    .filter((file) => /\/api\/.*\/route\.ts$/.test(file))
    .filter(
      (file) =>
        !file.includes('/api/auth/') &&
        !file.includes('/api/operator/') &&
        !file.includes('/api/ingest/') &&
        !file.includes('/api/agent/') &&
        !file.includes('/api/cron/') &&
        !file.includes('/api/webhooks/') &&
        !file.includes('/api/voice/') &&
        !file.includes('/api/onboarding/') &&
        !file.includes('/onboarding/') &&
        !file.includes('/api/qbo/webhook') &&
        !file.includes('/api/delivery-engine/') &&
        !file.endsWith('/api/expenses/route.ts') &&
        !file.includes('/api/leads/') &&
        !file.includes('/api/reactivation/')
    )
    .filter((file) => /getSupabaseServiceClient|getPortalAdminClient|SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(appRoot.pathname, file))

  assert.deepEqual(offenders, [])

  const serviceRoleRoutes = filesUnder(appRoot)
    .filter((file) => /\/api\/.*\/route\.ts$/.test(file))
    .filter((file) => /getSupabaseServiceClient|getPortalAdminClient|SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(appRoot.pathname, file))
    .sort()
  assert.deepEqual(serviceRoleRoutes, [
    'api/agent/brief/route.ts',
    'api/agent/campaigns/route.ts',
    'api/agent/cs/route.ts',
    'api/agent/instantly/backfill/route.ts',
    'api/agent/instantly/duplicate-template/route.ts',
    'api/agent/instantly/ensure/route.ts',
    'api/agent/instantly/push-leads/route.ts',
    'api/agent/instantly/push-sequence/route.ts',
    'api/agent/leads/cohort/route.ts',
    'api/agent/leads/export/route.ts',
    'api/agent/leads/inventory/route.ts',
    'api/agent/leads/ledger/route.ts',
    'api/agent/leads/mark/route.ts',
    'api/agent/leads/route.ts',
    'api/agent/lists/[id]/members/route.ts',
    'api/agent/lists/route.ts',
    'api/agent/offers/cells/route.ts',
    'api/agent/offers/desk/route.ts',
    'api/agent/outbound/[kind]/[id]/route.ts',
    'api/agent/outbound/[kind]/route.ts',
    'api/agent/outbound/campaigns/[campaignId]/copy/route.ts',
    'api/agent/outbound/pathway/route.ts',
    'api/agent/outbound/pathway/runs/route.ts',
    'api/agent/outbound/preparation/route.ts',
    'api/agent/outbound/summary/route.ts',
    'api/agent/outbound/waves/route.ts',
    'api/agent/sync/route.ts',
    'api/agent/workspace/route.ts',
    'api/clients/[id]/onboarding/route.ts',
    'api/cron/daily-sync/route.ts',
    'api/delivery-engine/accounts/route.ts',
    'api/delivery-engine/intake/route.ts',
    'api/delivery-engine/route.ts',
    'api/delivery-engine/webhooks/twilio/route.ts',
    'api/delivery-engine/webhooks/twilio/status/route.ts',
    'api/delivery-engine/worker/route.ts',
    'api/expenses/route.ts',
    'api/ingest/comms/route.ts',
    'api/ingest/leads/route.ts',
    'api/ingest/site-events/route.ts',
    'api/leads/[id]/route.ts',
    'api/leads/bulk/route.ts',
    'api/leads/facets/route.ts',
    'api/leads/list/route.ts',
    'api/leads/summary/route.ts',
    'api/leads/upload/route.ts',
    'api/onboarding/[token]/route.ts',
    'api/operator/invitations/route.ts',
    'api/operator/outbound/preparation/[id]/route.ts',
    'api/qbo/webhook/route.ts',
    'api/reactivation/sms/route.ts',
    'api/voice/inbound/route.ts',
    'api/voice/postcall/route.ts',
    'api/voice/sms/route.ts',
    'api/voice/tools/route.ts',
    'api/webhooks/instantly/route.ts'
  ])
})

test('customer delivery code has no wildcard select or private-domain names', () => {
  const deliveryFiles = filesUnder(appRoot)
    .filter((file) => file.includes('/delivery/') || file.includes('/api/delivery/'))
    .filter((file) => /\.(?:ts|tsx)$/.test(file))
  const forbidden = /select\(\s*['"]\*['"]\s*\)|compass_tasks|lead_contacts|internal_notes|billing_cents|operator_task_id/
  const offenders = deliveryFiles
    .filter((file) => forbidden.test(readFileSync(file, 'utf8')))
    .map((file) => relative(appRoot.pathname, file))

  assert.deepEqual(offenders, [])
})

test('every cookie-authenticated mutation route enforces a same-origin request', () => {
  const offenders = filesUnder(appRoot)
    .filter((file) => /\/api\/.*\/route\.ts$/.test(file))
    .filter((file) => /export async function (?:POST|PATCH|DELETE)\b/.test(readFileSync(file, 'utf8')))
    .filter(
      (file) =>
        !file.includes('/api/ingest/') &&
        !file.includes('/api/agent/') &&
        !file.includes('/api/cron/') &&
        !file.includes('/api/webhooks/') &&
        !file.includes('/api/voice/') &&
        !file.includes('/api/onboarding/') &&
        !file.includes('/api/qbo/webhook') &&
        !file.includes('/api/reactivation/') &&
        !file.includes('/api/delivery-dept/')
        && !file.endsWith('/api/delivery-engine/intake/route.ts')
        && !file.endsWith('/api/delivery-engine/worker/route.ts')
        && !file.includes('/api/delivery-engine/webhooks/')
        && !file.endsWith('/api/payments/stripe-webhook/route.ts')
    )
    .filter((file) => !/requireSameOrigin/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(appRoot.pathname, file))

  assert.deepEqual(offenders, [])

  const helper = readFileSync(new URL('../src/lib/portal-http.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(helper, /x-forwarded-host|x-forwarded-proto/i)
})
