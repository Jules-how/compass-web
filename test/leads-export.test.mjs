import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const route = readFileSync(resolve(root, 'src/app/api/agent/leads/export/route.ts'), 'utf8')
const lib = readFileSync(resolve(root, 'src/lib/leads-ledger.ts'), 'utf8')

function clampExportLimit(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 50
  return Math.min(200, Math.max(1, Math.trunc(v)))
}

test('export is cursor paged and capped at 200', () => {
  assert.match(route, /vertical_required/)
  assert.match(route, /next_cursor/)
  assert.match(route, /clampExportLimit/)
  assert.match(route, /hasUsableEmail/)
  assert.match(lib, /EXPORT_MAX_LIMIT = 200/)
  assert.equal(clampExportLimit(50000), 200)
  assert.equal(clampExportLimit(0), 1)
  assert.equal(clampExportLimit('80'), 80)
})
