import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  GOOGLE_RSA_LIMITS,
  generatePlanFromPack,
  isMutateStepComplete,
  mergeGoogleIds,
  pendingMutateSteps,
  resolveMergeFields,
  resolveTradePackId,
  truncateToLimit,
  validateRsaLimits
} from '../src/lib/google-attach/plan-core.mjs'

import {
  buildGeoCampaignCriterionOps,
  buildPendingGeo,
  buildSharedNegativeMutateOps,
  parseServiceSuburbs,
  shapeGeoPlan,
  shouldUseProximityFallback
} from '../src/lib/google-attach/geo-core.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function loadPack(id) {
  return JSON.parse(read(`funnels/google-packs/${id}.json`))
}

test('migration 0072 defines compass_google_attach with RLS', () => {
  const migration = read('supabase/migrations/0074_compass_google_attach.sql')
  assert.match(migration, /compass_google_attach/)
  assert.match(migration, /status text NOT NULL DEFAULT 'draft'/)
  assert.match(migration, /plan jsonb/)
  assert.match(migration, /google_ids jsonb/)
  assert.match(migration, /portal_is_operator/)
})

test('trade packs exist with clusters and RSA templates', () => {
  for (const id of ['plumbing_gas', 'hvac_refrig', 'electrical_av', 'roofing']) {
    const pack = loadPack(id)
    assert.equal(pack.pack_id, id)
    assert.equal(pack.locale, 'en-AU')
    assert.ok(pack.clusters.length >= 4)
    assert.ok(pack.shared_negatives.includes('tafe'))
    assert.ok(pack.shared_negatives.includes('diy'))
    for (const cluster of pack.clusters) {
      assert.ok(cluster.keywords.length >= 4)
      assert.equal(cluster.rsa_templates.length, 2)
    }
  }
})

test('resolveTradePackId maps AU trade strings', () => {
  assert.equal(resolveTradePackId('plumbing'), 'plumbing_gas')
  assert.equal(resolveTradePackId('HVAC'), 'hvac_refrig')
  assert.equal(resolveTradePackId('electrician'), 'electrical_av')
  assert.equal(resolveTradePackId('roofing'), 'roofing')
  assert.equal(resolveTradePackId('pest control'), null)
})

test('merge fields resolve and RSA char limits enforced', () => {
  const pack = loadPack('plumbing_gas')
  const fields = {
    business: 'Northside Plumbing Co',
    suburb: 'Brisbane',
    years: '15+',
    phone: '+61400111222',
    destination: 'https://switchflow.agency/lp/demo'
  }

  const plan = generatePlanFromPack(pack, fields, fields.destination)
  assert.match(plan.campaign_name, /Northside Plumbing/)
  assert.ok(plan.ad_groups.length >= 4)
  assert.ok(plan.negatives.length >= 20)

  for (const group of plan.ad_groups) {
    assert.equal(group.rsas.length, 2)
    for (const rsa of group.rsas) {
      const check = validateRsaLimits(rsa)
      assert.equal(check.ok, true, `${group.cluster_id} ${check.field} too long`)
      for (const h of rsa.headlines) {
        assert.ok(h.length <= GOOGLE_RSA_LIMITS.headline, `headline: ${h}`)
      }
      for (const d of rsa.descriptions) {
        assert.ok(d.length <= GOOGLE_RSA_LIMITS.description, `description: ${d}`)
      }
    }
  }

  assert.equal(plan.assets.call.phone_number, '+61400111222')
  assert.ok(plan.assets.sitelinks[0].url.includes('switchflow.agency'))
})

test('truncateToLimit respects headline and description caps', () => {
  const long = 'A'.repeat(40)
  assert.equal(truncateToLimit(long, 30).length, 30)
  assert.equal(resolveMergeFields('Hello {suburb}', { suburb: 'Sydney' }), 'Hello Sydney')
})

test('parseServiceSuburbs splits delivery field', () => {
  assert.deepEqual(parseServiceSuburbs('Brisbane, Gold Coast; Perth'), [
    'Brisbane',
    'Gold Coast',
    'Perth'
  ])
  assert.deepEqual(buildPendingGeo(['Sydney']).pending, true)
})

test('shapeGeoPlan adds proximity when fewer than half resolve', () => {
  const suburbs = ['Brisbane', 'Gold Coast', 'Perth', 'Fakeville']
  const suggestions = [
    {
      searchTerm: 'Brisbane',
      geoTargetConstant: {
        resourceName: 'geoTargetConstants/1000286',
        name: 'Brisbane',
        targetType: 'City',
        countryCode: 'AU'
      }
    }
  ]
  const geo = shapeGeoPlan(suburbs, suggestions)
  assert.equal(geo.pending, false)
  assert.equal(geo.locations.length, 1)
  assert.deepEqual(geo.unresolved, ['Gold Coast', 'Perth', 'Fakeville'])
  assert.equal(shouldUseProximityFallback(1, 4), true)
  assert.ok(geo.proximity_fallback?.enabled)
  assert.equal(geo.proximity_fallback.radius_km, 25)
  assert.equal(geo.proximity_fallback.anchor.resource_name, 'geoTargetConstants/1000286')
})

test('buildGeoCampaignCriterionOps includes location and proximity', () => {
  const geo = shapeGeoPlan(
    ['Brisbane', 'Fakeville', 'Nowhere'],
    [
      {
        searchTerm: 'Brisbane',
        geoTargetConstant: {
          resourceName: 'geoTargetConstants/1000286',
          name: 'Brisbane',
          targetType: 'City',
          countryCode: 'AU'
        }
      }
    ]
  )
  const ops = buildGeoCampaignCriterionOps('customers/1/campaigns/2', geo, {})
  assert.equal(ops.length, 2)
  assert.match(JSON.stringify(ops[0]), /geoTargetConstant/)
  assert.match(JSON.stringify(ops[1]), /proximity/)
  assert.match(JSON.stringify(ops[1]), /KILOMETERS/)
})

test('buildSharedNegativeMutateOps creates set, criteria, and campaign link', () => {
  const plan = {
    negatives: ['job', 'diy', 'tafe']
  }
  const ops = buildSharedNegativeMutateOps('1234567890', 'customers/1234567890/campaigns/2', plan, {})
  assert.equal(ops.length, 5)
  assert.match(JSON.stringify(ops[0]), /sharedSetOperation/)
  assert.match(JSON.stringify(ops[0]), /NEGATIVE_KEYWORDS/)
  assert.match(JSON.stringify(ops[1]), /sharedCriterionOperation/)
  assert.match(JSON.stringify(ops[1]), /PHRASE/)
  assert.match(JSON.stringify(ops[4]), /campaignSharedSetOperation/)
})

test('shared negative mutate ops are idempotent when google_ids populated', () => {
  const plan = { negatives: ['job', 'diy'] }
  const ids = {
    shared_negative_set: 'customers/1/sharedSets/400',
    shared_negative_criteria: ['neg:job', 'neg:diy'],
    campaign_shared_set: 'customers/1/campaignSharedSets/1',
    shared_negative_keywords_expected: 2
  }
  const ops = buildSharedNegativeMutateOps('1', 'customers/1/campaigns/2', plan, ids)
  assert.equal(ops.length, 0)
  assert.equal(isMutateStepComplete(ids, 'shared_negatives'), true)
})

test('mutate idempotency skips completed steps', () => {
  const googleIds = {
    budget_resource: 'customers/1/campaignBudgets/1',
    campaign_resource: 'customers/1/campaigns/2',
    geo_criteria: ['loc:geoTargetConstants/1'],
    ad_groups: { emergency: 'customers/1/adGroups/10' },
    keywords: ['customers/1/adGroupCriteria/1'],
    rsas: ['customers/1/adGroupAds/1']
  }
  const geo = {
    pending: false,
    suburbs: ['Brisbane'],
    locations: [{ resource_name: 'geoTargetConstants/1' }],
    unresolved: [],
    proximity_fallback: null
  }

  assert.equal(isMutateStepComplete(googleIds, 'budget', geo), true)
  assert.equal(isMutateStepComplete(googleIds, 'geo_targeting', geo), true)
  assert.equal(isMutateStepComplete(googleIds, 'call_asset', geo), false)

  const pending = pendingMutateSteps(googleIds, geo)
  assert.ok(pending.includes('call_asset'))
  assert.ok(!pending.includes('budget'))

  const merged = mergeGoogleIds(googleIds, {
    call_asset: 'customers/1/assets/99',
    keywords: ['customers/1/adGroupCriteria/2']
  })
  assert.equal(merged.call_asset, 'customers/1/assets/99')
  assert.equal(merged.keywords.length, 2)
})

test('google attach sources wire API + panel', () => {
  const route = read('src/app/api/clients/[id]/google-attach/route.ts')
  const patchRoute = read('src/app/api/clients/[id]/google-attach/[attachId]/route.ts')
  const panel = read('src/components/clients/ClientGoogleAttachPanel.tsx')
  const docs = read('docs/GOOGLE_ATTACH.md')

  assert.match(route, /createGoogleAttachDraft/)
  assert.match(route, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  assert.match(patchRoute, /push_paused/)
  assert.match(patchRoute, /invite_mcc/)
  assert.match(patchRoute, /archive/)
  assert.doesNotMatch(patchRoute, /activate/)
  assert.match(panel, /ClientDetailPanel/)
  assert.match(panel, /Push paused/)
  assert.match(panel, /Geo targeting/)
  assert.match(docs, /GOOGLE_ADS_DEVELOPER_TOKEN/)
})
