import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirrors matchesFilters / filterLibraryRows offer_key semantics. */
function matchesOfferKey(rowOfferKey, filterOfferKey) {
  if (!filterOfferKey) return true
  if (typeof rowOfferKey === 'string' && rowOfferKey && rowOfferKey !== filterOfferKey) return false
  return true
}

test('offer_key filter keeps unscoped library rows visible', () => {
  assert.equal(matchesOfferKey(undefined, 'ai-enablement'), true)
  assert.equal(matchesOfferKey(null, 'ai-enablement'), true)
  assert.equal(matchesOfferKey('', 'ai-enablement'), true)
  assert.equal(matchesOfferKey('ai-enablement', 'ai-enablement'), true)
  assert.equal(matchesOfferKey('growth-system', 'ai-enablement'), false)
  assert.equal(matchesOfferKey('growth-system', undefined), true)
})

test('local store / API / agent filters use scoped-only offer_key matching', () => {
  for (const rel of [
    'src/lib/outbound-local-store.ts',
    'src/lib/outbound-api.ts',
    'src/lib/agent-outbound.ts'
  ]) {
    const src = read(rel)
    assert.match(
      src,
      /typeof scoped === 'string' && scoped && scoped !== filters\.offer_key/,
      `${rel} should only exclude offer-scoped rows`
    )
    assert.doesNotMatch(
      src,
      /if \(filters\??\.offer_key && row\.offer_key !== filters\.offer_key\)/,
      `${rel} must not use strict offer_key inequality that hides unscoped rows`
    )
  }
})

test('editor components rail filters by campaign and lists tag hints', () => {
  const src = read('src/components/outbound/EditorComponentsAccordion.tsx')
  assert.match(src, /VERTICAL_TAG_HINTS/)
  assert.match(src, /This campaign/)
  assert.match(src, /listLibraryBundle/)
  assert.match(src, /campaignOnly/)
})

test('sequence editor exposes Instantly base variables for copy transfer', () => {
  const vars = read('src/lib/instantly-variables.ts')
  for (const key of [
    'email',
    'firstName',
    'lastName',
    'companyName',
    'jobTitle',
    'personalization',
    'phone',
    'website',
    'location',
    'linkedIn'
  ]) {
    assert.match(vars, new RegExp(`key: '${key}'`))
    assert.match(vars, new RegExp(`token: '\\{\\{${key}\\}\\}'`))
  }

  const editor = read('src/components/outbound/SequenceEditor.tsx')
  assert.match(editor, /INSTANTLY_BASE_VARIABLES/)
  assert.match(editor, /Instantly variables/)
  assert.doesNotMatch(editor, /ToolbarIcon/)
  assert.doesNotMatch(editor, /label="AI assist"/)
})
