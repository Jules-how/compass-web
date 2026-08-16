import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('lead database uses the records-table grid', () => {
  const table = readFileSync(resolve(root, 'src/components/LeadTable.tsx'), 'utf8')
  const records = readFileSync(
    resolve(root, 'src/components/ui/records-table.tsx'),
    'utf8'
  )
  assert.match(table, /from '@\/components\/ui\/records-table'/)
  assert.match(table, /<RecordsTable/)
  assert.match(records, /records-sticky-cell/)
  assert.match(records, /records-resize/)
  assert.match(records, /first_name/)
  const cols = readFileSync(resolve(root, 'src/lib/lead-columns.ts'), 'utf8')
  assert.match(cols, /Connection strength/)
})
