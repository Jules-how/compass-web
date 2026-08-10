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
