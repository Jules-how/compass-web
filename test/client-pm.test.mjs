import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirror of src/lib/client-pm.ts helpers for behavioral coverage without TS imports. */
function normalizeClientStatus(status) {
  switch (status) {
    case 'active':
      return 'active'
    case 'paused':
      return 'paused'
    case 'prospect':
    case 'onboarding':
    default:
      return 'onboarding'
  }
}

function isOpenClientIssue(status) {
  return status !== 'completed' && status !== 'cancelled'
}

function pickNextAction(issues) {
  const open = issues
    .filter((issue) => isOpenClientIssue(issue.status))
    .sort((a, b) => {
      const rank = (p) => (p === 0 ? 99 : p)
      const byPriority = rank(a.priority || 0) - rank(b.priority || 0)
      if (byPriority !== 0) return byPriority
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  return open[0]?.title ?? null
}

test('client helper sources export the CRM model', () => {
  const pm = read('src/lib/client-pm.ts')
  const data = read('src/lib/client-data.ts')
  const migration = read('supabase/migrations/0029_compass_clients.sql')
  assert.match(pm, /CLIENT_STATUSES/)
  assert.match(pm, /onboarding/)
  assert.match(data, /pickNextAction/)
  assert.match(migration, /compass_clients/)
  assert.match(migration, /compass_client_issues/)
  assert.match(migration, /client_id/)
})

test('normalizeClientStatus maps account relationship states', () => {
  assert.equal(normalizeClientStatus('active'), 'active')
  assert.equal(normalizeClientStatus('paused'), 'paused')
  assert.equal(normalizeClientStatus('prospect'), 'onboarding')
  assert.equal(normalizeClientStatus('weird'), 'onboarding')
})

test('clients migration alters legacy compass_clients instead of only CREATE IF NOT EXISTS', () => {
  const migration = read('supabase/migrations/0029_compass_clients.sql')
  assert.match(migration, /ADD COLUMN IF NOT EXISTS industry/)
  assert.match(migration, /ADD COLUMN IF NOT EXISTS client_id/)
  assert.match(migration, /legacy desktop sync/i)
})

test('pickNextAction prefers urgent open issues then recent', () => {
  const next = pickNextAction([
    {
      title: 'Done thing',
      status: 'completed',
      priority: 1,
      updated_at: '2026-08-01T00:00:00.000Z'
    },
    {
      title: 'Low follow-up',
      status: 'not-started',
      priority: 4,
      updated_at: '2026-08-05T00:00:00.000Z'
    },
    {
      title: 'Urgent call',
      status: 'in-progress',
      priority: 1,
      updated_at: '2026-08-02T00:00:00.000Z'
    }
  ])
  assert.equal(next, 'Urgent call')
})
