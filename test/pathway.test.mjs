import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(resolve(root, 'src/lib/pathway.ts'), 'utf8')

const PATHWAY_STAGE_IDS = [
  'maps',
  'filter',
  'verify',
  'finder',
  'names',
  'hipages',
  'google_ads',
  'meta_ads',
  'openers'
]

const DEFAULT_PATHWAY_STAGES = PATHWAY_STAGE_IDS.map((id) => ({
  id,
  tool: id === 'filter' ? 'filter_leads' : id === 'openers' ? 'generate_openers' : id === 'names' || id === 'hipages' ? 'firecrawl' : 'apify',
  skip: false
}))

function normalizeStages(raw) {
  const byId = new Map()
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue
      const id = String(row.id || '')
      if (!PATHWAY_STAGE_IDS.includes(id)) continue
      byId.set(id, {
        id,
        tool: row.tool === 'skip' || row.skip === true ? 'skip' : row.tool || 'apify',
        skip: row.skip === true || row.tool === 'skip'
      })
    }
  }
  return DEFAULT_PATHWAY_STAGES.map((stage) => {
    const overlay = byId.get(stage.id)
    return overlay ? { ...stage, ...overlay } : { ...stage }
  })
}

function mergeRecipeStages(base, overlay) {
  if (!overlay || overlay.length === 0) return base.map((s) => ({ ...s }))
  const byId = new Map(overlay.map((s) => [s.id, s]))
  return base.map((stage) => {
    const next = byId.get(stage.id)
    return next ? { ...stage, ...next } : { ...stage }
  })
}

function fillOpenerTemplate(structure, slots) {
  const company = (slots.company || '').trim() || 'you'
  const suburb = (slots.suburb || '').trim() || 'town'
  const specialty = (slots.specialty || '').trim() || 'the'
  let body = structure
    .replaceAll('{company}', company)
    .replaceAll('{suburb}', suburb)
    .replaceAll('{specialty}', specialty)
    .trim()
  const firstName = (slots.firstName || '').trim()
  if (firstName) {
    if (!/^hi\s/i.test(body)) {
      const rest = body.charAt(0).toLowerCase() + body.slice(1)
      body = `Hi ${firstName}, saw ${rest}`
    }
  } else {
    body = body.replace(/^Hi\s+[^,]+,\s*saw\s+/i, 'Saw ')
  }
  return body
}

function shouldRegenerateOpener(row) {
  return row.opener_override !== true
}

function pickTemplateForSignal(templates, fields) {
  const ordered = [...templates].sort((a, b) => a.sortOrder - b.sortOrder)
  for (const template of ordered) {
    const value = (fields[template.signalWhen.field] || '').trim()
    if (template.signalWhen.op === 'present' && value) return template.id
  }
  return null
}

test('overlay can skip meta ads without dropping verify', () => {
  const stages = normalizeStages([{ id: 'meta_ads', skip: true }, { id: 'bogus', tool: 'parallel' }])
  assert.equal(stages.length, 9)
  assert.equal(stages.find((s) => s.id === 'verify').skip, false)
  assert.equal(stages.find((s) => s.id === 'meta_ads').skip, true)
})

test('list overlay wins tool on one stage', () => {
  const merged = mergeRecipeStages(DEFAULT_PATHWAY_STAGES, [
    { id: 'maps', tool: 'parallel', skip: false }
  ])
  assert.equal(merged[0].tool, 'parallel')
  assert.equal(merged[1].tool, 'filter_leads')
})

test('named opener gets Hi prefix; unnamed starts at Saw', () => {
  const structure = 'Saw {company} handles {specialty} work across {suburb}.'
  assert.match(
    fillOpenerTemplate(structure, { firstName: 'Trent', company: 'Rayco', suburb: 'Cleveland', specialty: 'gas' }),
    /^Hi Trent, saw /
  )
  assert.match(
    fillOpenerTemplate('Hi Trent, saw you handle gas work across Cleveland.', { firstName: '', company: 'Rayco', suburb: 'Cleveland', specialty: 'gas' }),
    /^Saw /
  )
})

test('override rows skip class regenerate', () => {
  assert.equal(shouldRegenerateOpener({ opener_override: true }), false)
  assert.equal(shouldRegenerateOpener({ opener_override: false }), true)
})

test('first matching present signal wins', () => {
  const id = pickTemplateForSignal(
    [
      { id: 'paid', sortOrder: 0, signalWhen: { field: 'paid_demand', op: 'present' } },
      { id: 'spec', sortOrder: 1, signalWhen: { field: 'specialty', op: 'present' } }
    ],
    { paid_demand: 'Google Ads', specialty: 'split system' }
  )
  assert.equal(id, 'paid')
})

test('source keeps the fixed stage list and default templates', () => {
  assert.match(src, /PATHWAY_STAGE_IDS/)
  assert.match(src, /generate_openers/)
  assert.match(src, /DEFAULT_OPENER_TEMPLATES/)
  assert.match(src, /fillOpenerTemplate/)
})
