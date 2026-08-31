import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildCopyFromCell, buildDraftPayload, extractMergeFacts, mergeCopyTemplate } from '../src/lib/meta-attach/draft-merge.ts'
import {
  orchestratePausedCreate,
  validatePushReady
} from '../src/lib/meta-attach/create-paused.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packsDir = resolve(root, 'funnels/meta-packs')

function readPack(id) {
  return JSON.parse(readFileSync(join(packsDir, `${id}.json`), 'utf8'))
}

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

test('migration 0071 defines compass_meta_attach with RLS', () => {
  const sql = read('supabase/migrations/0073_compass_meta_attach.sql')
  assert.match(sql, /compass_meta_attach/)
  assert.match(sql, /portal_is_operator/)
  assert.match(sql, /created_paused/)
})

test('all meta packs exist with offer cells and copy lengths', () => {
  for (const id of ['plumbing_gas', 'hvac_refrig', 'electrical_av', 'roofing']) {
    const pack = readPack(id)
    assert.equal(pack.pack_id, id)
    assert.ok(Object.keys(pack.offer_cells).length >= 2, `${id} needs multiple cells`)
    for (const [cellId, cell] of Object.entries(pack.offer_cells)) {
      assert.equal(cell.primary_texts.length, 3, `${id}.${cellId} primary_texts`)
      assert.equal(cell.headlines.length, 5, `${id}.${cellId} headlines`)
      assert.equal(cell.descriptions.length, 3, `${id}.${cellId} descriptions`)
      assert.ok(cell.creative_brief.photo_direction, `${id}.${cellId} brief`)
      assert.ok(cell.creative_brief.ratios?.includes('1:1'))
      assert.match(String(cell.creative_brief.never), /generated|flat PNG|AI/i)
    }
  }
})

test('draft generator merges client facts into pack copy', () => {
  const pack = readPack('plumbing_gas')
  const client = {
    id: 'client-1',
    name: 'Northside Plumbing Pty Ltd',
    industry: 'Plumbing',
    deal_terms: {
      delivery: {
        trading_name: 'Northside Plumbing',
        spoken_business_name: 'Northside Plumbing',
        service_suburbs: 'Parramatta\nMerrylands',
        public_number: '0298765432'
      }
    },
    voice: { twilio_number: '+61298765432' }
  }

  const facts = extractMergeFacts(client)
  assert.equal(facts.business_name, 'Northside Plumbing')
  assert.equal(facts.city, 'Parramatta')
  assert.match(facts.phone, /98765432/)

  const merged = mergeCopyTemplate(pack.offer_cells.emergency_call.primary_texts[0], facts)
  assert.match(merged, /Northside Plumbing/)
  assert.match(merged, /Parramatta/)
  assert.ok(merged.length <= 140, 'primary text stays near Meta 125 target')

  const draft = buildDraftPayload({
    client,
    pack,
    offerCell: 'emergency_call'
  })
  assert.match(draft.destination_url, /\/lp\/northside-plumbing/)
  assert.equal(draft.copy.primary_texts.length, 3)
  assert.ok(draft.copy.headlines[0].includes('Parramatta'))
})

test('validatePushReady refuses missing canva, images, or AI-only', () => {
  const base = {
    id: 'mattach-1',
    client_id: 'c1',
    status: 'draft',
    offer_cell: 'emergency_call',
    destination_url: 'https://switchflow.agency/lp/test',
    copy: {
      primary_texts: ['Hello'],
      headlines: ['Headline'],
      descriptions: ['Desc']
    },
    creative_brief: {},
    canva_design_ids: {},
    meta_ids: {},
    review: {},
    created_at: '',
    updated_at: ''
  }

  assert.equal(validatePushReady(base).ok, false)
  const withCanva = {
    ...base,
    canva_design_ids: { square: 'DAF123' },
    review: { exported_image_urls: ['https://cdn.example/a.png'], meta_ad_account_id: 'act_1', meta_page_id: 'page_1' }
  }
  assert.equal(validatePushReady(withCanva).ok, true)
  assert.equal(
    validatePushReady({ ...withCanva, review: { ...withCanva.review, ai_generated_only: true } }).ok,
    false
  )
})

test('orchestrator is idempotent with mock adapter', async () => {
  const calls = { campaign: 0, adset: 0, upload: 0, creative: 0, ad: 0 }

  const adapter = {
    driver: 'direct',
    configured: true,
    async ensureCampaignPaused() {
      calls.campaign += 1
      return { id: 'camp_1' }
    },
    async ensureAdSetPaused() {
      calls.adset += 1
      return { id: 'adset_1' }
    },
    async uploadImage() {
      calls.upload += 1
      return { hash: `hash_${calls.upload}` }
    },
    async createCreative() {
      calls.creative += 1
      return { id: `cr_${calls.creative}` }
    },
    async createAdPaused() {
      calls.ad += 1
      return { id: `ad_${calls.ad}` }
    }
  }

  const row = {
    id: 'mattach-1',
    client_id: 'c1',
    status: 'draft',
    offer_cell: 'emergency_call',
    destination_url: 'https://switchflow.agency/lp/test',
    copy: {
      primary_texts: ['Burst pipe in Sydney?'],
      headlines: ['Emergency Plumber'],
      descriptions: ['Licensed team']
    },
    creative_brief: {
      budget_default_daily: 30,
      cta: 'GET_QUOTE',
      destination_type: 'WEBSITE',
      targeting_defaults: { geo_radius_km: 20, age_min: 25, age_max: 65 }
    },
    canva_design_ids: { square: 'DAF123' },
    meta_ids: {},
    review: {
      meta_ad_account_id: '123456',
      meta_page_id: 'page_99',
      exported_image_urls: ['https://cdn.example/a.png', 'https://cdn.example/b.png']
    },
    created_at: '',
    updated_at: ''
  }

  const offerCell = readPack('plumbing_gas').offer_cells.emergency_call

  const first = await orchestratePausedCreate({
    row,
    clientName: 'Test Plumbing',
    vertical: 'plumbing_gas',
    offerCell,
    serviceSuburbs: ['Parramatta'],
    adapter
  })

  assert.equal(first.meta_ids.campaign_id, 'camp_1')
  assert.equal(first.meta_ids.ad_ids?.length, 2)
  assert.equal(calls.campaign, 1)
  assert.equal(calls.upload, 2)

  const second = await orchestratePausedCreate({
    row: { ...row, meta_ids: first.meta_ids },
    clientName: 'Test Plumbing',
    vertical: 'plumbing_gas',
    offerCell,
    serviceSuburbs: ['Parramatta'],
    adapter
  })

  assert.equal(second.meta_ids.campaign_id, 'camp_1')
  assert.equal(second.meta_ids.ad_ids?.length, 2)
  assert.equal(calls.campaign, 1, 'campaign not recreated')
  assert.equal(calls.adset, 1, 'adset not recreated')
  assert.equal(calls.upload, 2, 'no extra uploads when ads already exist')
})
