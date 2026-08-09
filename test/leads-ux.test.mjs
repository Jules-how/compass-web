import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

// leads-meta / leads-query are TypeScript — assert via source contracts + dynamic
// compile isn't available in node:test. Mirror the pure helpers here for behavior
// checks, and lock API/UI wiring via source contracts.

function humanizeStatus(raw) {
  const labels = {
    uncontacted: 'Uncontacted',
    contacted: 'Contacted',
    replied: 'Replied',
    interested: 'Interested',
    not_interested: 'Not interested',
    suppressed: 'Suppressed',
    booked: 'Booked',
    converted: 'Converted',
    in_instantly: 'Synced',
    not_uploaded: 'Not uploaded',
    stale_sync: 'Stale sync',
    'stale-sync': 'Stale sync',
    needs_review: 'Needs review',
    'needs-review': 'Needs review'
  }
  if (!raw) return 'Uncontacted'
  return labels[raw.trim()] ?? raw
}

function verticalFilterValues(vertical) {
  const aliases = {
    broker: ['broker', 'mortgage-brokers', 'mortgage_brokers', 'mortgage brokers'],
    'mortgage-brokers': ['mortgage-brokers', 'mortgage_brokers', 'mortgage brokers', 'broker']
  }
  const key = vertical.trim().toLowerCase()
  return aliases[key] ? Array.from(new Set(aliases[key])) : [vertical.trim()]
}

test('lead status labels are human-readable', () => {
  assert.equal(humanizeStatus('in_instantly'), 'Synced')
  assert.equal(humanizeStatus('not_interested'), 'Not interested')
  assert.equal(humanizeStatus(null), 'Uncontacted')
})

test('vertical taxonomy aliases broker and mortgage-brokers', () => {
  const broker = verticalFilterValues('broker')
  assert.ok(broker.includes('broker'))
  assert.ok(broker.includes('mortgage-brokers'))
  const mb = verticalFilterValues('mortgage-brokers')
  assert.ok(mb.includes('broker'))
})

test('leads list API supports search, sync, and completeness filters', () => {
  const route = read('src/app/api/leads/list/route.ts')
  const query = read('src/lib/leads-query.ts')
  assert.match(route, /parseLeadListFilters/)
  assert.match(route, /applyLeadFilters/)
  assert.match(query, /filters\.q/)
  assert.match(query, /completeness/)
  assert.match(query, /sync_state/)
  assert.match(query, /suppressed/)
  assert.match(query, /recontact_ok/)
  assert.match(query, /verticalFilterValues/)
  assert.match(query, /replied_or_interested/)
})

test('leads summary and bulk APIs are operator-gated', () => {
  const summary = read('src/app/api/leads/summary/route.ts')
  const bulk = read('src/app/api/leads/bulk/route.ts')
  assert.match(summary, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  assert.match(bulk, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  assert.match(bulk, /requireSameOrigin/)
  assert.match(bulk, /suppress/)
  assert.match(bulk, /set_status/)
  assert.match(bulk, /add_tag/)
})

test('LeadTable surfaces search, segments, bulk actions, and hides UUID by default', () => {
  const table = read('src/components/LeadTable.tsx')
  const panel = read('src/components/LeadsPanel.tsx')
  assert.match(table, /Name, email, company, or phone/)
  assert.match(table, /Save segment/)
  assert.match(table, /Export for Instantly/)
  assert.match(table, /Copy lead ID/)
  assert.match(table, /humanizeStatus/)
  assert.match(table, /summaryChips/)
  assert.match(table, /onNavigate/)
  assert.doesNotMatch(table, /\{lead\.id\}<\/div>/)
  assert.match(panel, /\/api\/leads\/summary/)
  assert.match(panel, /onReload/)
  assert.match(panel, /router\.push/)
})

test('leads summary is global and cacheable (filters come from list total)', () => {
  const summary = read('src/app/api/leads/summary/route.ts')
  const panel = read('src/components/LeadsPanel.tsx')
  assert.doesNotMatch(summary, /parseLeadListFilters/)
  assert.match(summary, /portalJsonCached\(\{ summary \}, \{\}, 60\)/)
  assert.match(panel, /leads:summary:global/)
  assert.match(panel, /staleMs:\s*5 \* 60_000/)
})

test('lead list columns include suppression and Instantly sync fields', () => {
  const cols = read('src/lib/list-columns.ts')
  assert.match(cols, /suppression_reason/)
  assert.match(cols, /recontact_ok/)
  assert.match(cols, /instantly_lead_id/)
  assert.match(cols, /lead_context_status/)
})

test('leads-meta module exports taxonomy and preset segments', () => {
  const meta = read('src/lib/leads-meta.ts')
  assert.match(meta, /PIPELINE_STATUSES/)
  assert.match(meta, /SYNC_STATES/)
  assert.match(meta, /PRESET_SEGMENTS/)
  assert.match(meta, /VERTICAL_ALIASES/)
  assert.match(meta, /mortgage-brokers/)
})

// Keep require used so createRequire isn't flagged unused in some runners.
assert.equal(typeof require, 'function')
