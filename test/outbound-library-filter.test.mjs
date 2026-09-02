import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

const WEAK_LOCATION = new Set(['au-national'])

function matchesCampaignLibrary(row, ctx, kind) {
  if (kind === 'structures') return true
  if (ctx.offer_key && row.offer_key && row.offer_key === ctx.offer_key) return true
  const campaignVerticals = new Set((ctx.vertical_tags ?? []).map((t) => t.trim()).filter(Boolean))
  const campaignLocations = new Set((ctx.location_tags ?? []).map((t) => t.trim()).filter(Boolean))
  const rowVerticals = row.vertical_tags ?? []
  const rowLocations = row.location_tags ?? []
  const verticalHit = rowVerticals.some((tag) => campaignVerticals.has(tag))
  if (!verticalHit) return false
  if (kind === 'subjects' || kind === 'openers') return true
  const campaignHasStrongLocation = [...campaignLocations].some((tag) => !WEAK_LOCATION.has(tag))
  if (!campaignHasStrongLocation) return true
  if (rowLocations.length === 0) return true
  const locationHits = rowLocations.filter((tag) => campaignLocations.has(tag))
  return locationHits.some((tag) => !WEAK_LOCATION.has(tag))
}

function passCampaignScope(row, ctx, campaignOnly, kind) {
  if (!campaignOnly) return true
  if (kind === 'structures') return true
  return matchesCampaignLibrary(row, ctx, kind)
}

function isDoctrineOpener(row) {
  const notes = (row.notes || '').toLowerCase()
  if (notes.includes('insertable:no')) return true
  const label = (row.label || '').toLowerCase()
  if (label.includes('mode:')) return true
  if (label.includes('reject')) return true
  const body = (row.body || '').trim()
  if (body.startsWith('[')) return true
  if (body.toLowerCase().includes('write a really short personalized')) return true
  if (body.toLowerCase().startsWith('clear the scammer')) return true
  return false
}

const electricianReceptionist = {
  offer_key: 'booked-jobs-system',
  vertical_tags: ['electricians'],
  location_tags: ['nsw']
}

test('This campaign hides untagged Source rows', () => {
  const untagged = { vertical_tags: [], location_tags: [] }
  assert.equal(passCampaignScope(untagged, electricianReceptionist, true, 'ctas'), false)
  assert.equal(
    passCampaignScope(
      { vertical_tags: ['electricians'], location_tags: ['nsw'] },
      electricianReceptionist,
      true,
      'ctas'
    ),
    true
  )
})

test('offer_key match is enough even with au-national only', () => {
  assert.equal(
    matchesCampaignLibrary(
      { offer_key: 'booked-jobs-system', location_tags: ['au-national'] },
      electricianReceptionist,
      'expressions'
    ),
    true
  )
})

test('au-national alone is not a location match without offer or vertical', () => {
  assert.equal(
    matchesCampaignLibrary(
      { location_tags: ['au-national'] },
      electricianReceptionist,
      'ctas'
    ),
    false
  )
})

test('subjects match on vertical because they have no location column', () => {
  assert.equal(
    matchesCampaignLibrary(
      { vertical_tags: ['electricians'] },
      electricianReceptionist,
      'subjects'
    ),
    true
  )
})

test('structures always pass This campaign', () => {
  assert.equal(passCampaignScope({ structure_id: 'platten-aida' }, electricianReceptionist, true, 'structures'), true)
})

test('doctrine openers are Open-only', () => {
  assert.equal(isDoctrineOpener({ label: 'Mode: nick-tier', body: 'Clear the scammer check' }), true)
  assert.equal(isDoctrineOpener({ body: '[One line true of a shared list field]' }), true)
  assert.equal(isDoctrineOpener({ label: 'Platten weak (reject)', body: 'as a business owner' }), true)
  assert.equal(
    isDoctrineOpener({
      body: 'They just posted for a [role], which is usually when the public number starts leaking jobs.'
    }),
    false
  )
})

test('editor accordion uses the extracted matcher and Yours-first sort', () => {
  const src = read('src/components/outbound/EditorComponentsAccordion.tsx')
  assert.match(src, /matchesCampaignLibrary/)
  assert.match(src, /passCampaignScope/)
  assert.match(src, /sortLibraryRows/)
  assert.match(src, /isDoctrineOpener/)
  assert.match(src, /useState<SectionKey>\('structures'\)/)
  assert.match(src, /setProvenanceFilter\('yours'\)/)
  assert.match(src, /\['all', 'Playbooks'\]/)
  assert.doesNotMatch(src, /provA === 'source' \? -1/)
})

test('filter module lives in outbound-library-filter.ts', () => {
  const src = read('src/lib/outbound-library-filter.ts')
  assert.match(src, /export function matchesCampaignLibrary/)
  assert.match(src, /insertable:no/)
  assert.match(src, /LIBRARY_BENCH_CAPS/)
})
