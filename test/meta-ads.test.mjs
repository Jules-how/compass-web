import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirror of selected meta-ads normalizers for behavioral coverage without TS imports. */
function normalizeMetaStatus(value) {
  const allowed = ['draft', 'active', 'paused', 'archived']
  return allowed.includes(value) ? value : 'draft'
}

function normalizeMetaObjective(value) {
  const allowed = [
    'OUTCOME_AWARENESS',
    'OUTCOME_TRAFFIC',
    'OUTCOME_ENGAGEMENT',
    'OUTCOME_LEADS',
    'OUTCOME_APP_PROMOTION',
    'OUTCOME_SALES'
  ]
  return allowed.includes(value) ? value : 'OUTCOME_LEADS'
}

function normalizeSpecialCategories(value) {
  const allowed = ['HOUSING', 'EMPLOYMENT', 'CREDIT', 'ISSUES_ELECTIONS_POLITICS']
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && allowed.includes(item))
}

test('meta ads migration defines campaign → ad set → ad hierarchy', () => {
  const migration = read('supabase/migrations/0032_compass_meta_ads.sql')
  assert.match(migration, /compass_meta_campaigns/)
  assert.match(migration, /compass_meta_ad_sets/)
  assert.match(migration, /compass_meta_ads/)
  assert.match(migration, /campaign_id text NOT NULL REFERENCES public\.compass_meta_campaigns/)
  assert.match(migration, /ad_set_id text NOT NULL REFERENCES public\.compass_meta_ad_sets/)
  assert.match(migration, /portal_is_operator/)
})

test('meta ads helpers normalize Meta upload enums', () => {
  assert.equal(normalizeMetaStatus('active'), 'active')
  assert.equal(normalizeMetaStatus('nope'), 'draft')
  assert.equal(normalizeMetaObjective('OUTCOME_SALES'), 'OUTCOME_SALES')
  assert.equal(normalizeMetaObjective('bogus'), 'OUTCOME_LEADS')
  assert.deepEqual(normalizeSpecialCategories(['HOUSING', 'X', 'CREDIT']), ['HOUSING', 'CREDIT'])
  assert.deepEqual(normalizeSpecialCategories(null), [])
})

test('meta ads sources wire client detail + API', () => {
  const lib = read('src/lib/meta-ads.ts')
  const types = read('src/lib/types.ts')
  const columns = read('src/lib/list-columns.ts')
  const route = read('src/app/api/clients/[id]/meta-ads/route.ts')
  const clientGet = read('src/app/api/clients/[id]/route.ts')
  const panel = read('src/components/clients/MetaAdsManagerPanel.tsx')
  const detail = read('src/components/clients/ClientDetailPanel.tsx')

  assert.match(lib, /META_CAMPAIGN_OBJECTIVES/)
  assert.match(lib, /META_CALL_TO_ACTIONS/)
  assert.match(types, /CompassMetaCampaign/)
  assert.match(types, /CompassMetaAdSet/)
  assert.match(types, /CompassMetaAd/)
  assert.match(columns, /META_CAMPAIGN_COLUMNS/)
  assert.match(route, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  assert.match(route, /requireSameOrigin/)
  assert.match(route, /kind === 'campaign'/)
  assert.match(route, /kind === 'ad_set'/)
  assert.match(clientGet, /compass_meta_campaigns/)
  assert.match(clientGet, /metaCampaigns/)
  assert.match(panel, /Create campaign/)
  assert.match(panel, /primary_text/)
  assert.match(detail, /MetaAdsManagerPanel/)
  assert.match(detail, /ads_manager/)
})
