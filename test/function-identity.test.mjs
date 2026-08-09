import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

test('function identity maps known modules to distinct kinds and accents', () => {
  const KIND_BY_KEY = {
    sales: 'sales',
    marketing: 'marketing',
    product: 'product',
    systems: 'product',
    'product-systems': 'product',
    'client-delivery': 'delivery',
    delivery: 'delivery'
  }
  const COLOR_BY_KEY = {
    sales: '#E85D2A',
    marketing: '#26B5CE',
    product: '#5E6AD2',
    'client-delivery': '#4CB782'
  }

  function normalize(value) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  function resolveKind(fn) {
    const candidates = [fn.slug, fn.name].filter(Boolean).map(normalize)
    for (const key of candidates) {
      if (KIND_BY_KEY[key]) return KIND_BY_KEY[key]
    }
    for (const key of candidates) {
      for (const [known, kind] of Object.entries(KIND_BY_KEY)) {
        if (key === known || key.startsWith(`${known}-`) || key.endsWith(`-${known}`)) {
          return kind
        }
      }
    }
    return 'generic'
  }

  function accent(fn) {
    const key = normalize(fn.slug || fn.name || '')
    if (COLOR_BY_KEY[key]) return COLOR_BY_KEY[key]
    for (const [known, color] of Object.entries(COLOR_BY_KEY)) {
      if (key.startsWith(`${known}-`) || key.endsWith(`-${known}`)) return color
    }
    return '#95A2B3'
  }

  assert.equal(resolveKind({ slug: 'sales', name: 'Sales' }), 'sales')
  assert.equal(resolveKind({ slug: 'marketing', name: 'Marketing' }), 'marketing')
  assert.equal(resolveKind({ name: 'Product & Systems' }), 'product')
  assert.equal(resolveKind({ slug: 'client-delivery', name: 'Client Delivery' }), 'delivery')

  assert.equal(accent({ slug: 'sales' }), '#E85D2A')
  assert.equal(accent({ slug: 'marketing' }), '#26B5CE')
  assert.equal(accent({ slug: 'product-systems' }), '#5E6AD2')
  assert.equal(accent({ slug: 'client-delivery' }), '#4CB782')

  const accents = [
    accent({ slug: 'sales' }),
    accent({ slug: 'marketing' }),
    accent({ slug: 'product-systems' }),
    accent({ slug: 'client-delivery' })
  ]
  assert.equal(new Set(accents).size, 4)
})

test('Functions hub uses shared identity colors and unique glyphs', () => {
  const manager = read('src/components/FunctionManager.tsx')
  const detail = read('src/components/FunctionDetailPanel.tsx')
  const glyph = read('src/components/FunctionGlyph.tsx')
  const identity = read('src/lib/function-identity.ts')
  const pm = read('src/lib/project-pm.ts')

  assert.match(identity, /export function resolveFunctionKind/)
  assert.match(identity, /export function functionAccentColor/)
  assert.match(glyph, /export function FunctionGlyph/)
  assert.match(glyph, /case 'sales'/)
  assert.match(glyph, /case 'marketing'/)
  assert.match(glyph, /case 'product'/)
  assert.match(glyph, /case 'delivery'/)
  assert.match(manager, /functionAccentColor/)
  assert.match(manager, /resolveFunctionKind/)
  assert.match(manager, /FunctionMark/)
  assert.doesNotMatch(manager, /FUNCTION_ICON_COLORS/)
  assert.doesNotMatch(manager, /initialsFromLabel/)
  assert.match(detail, /FunctionMark/)
  assert.match(detail, /functionAccentColor/)
  assert.match(pm, /product-systems/)
  assert.match(pm, /systems:/)
})
