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
  assert.match(records, /onOpenerChange/)
  assert.match(records, /onDragStart/)
  const cols = readFileSync(resolve(root, 'src/lib/lead-columns.ts'), 'utf8')
  assert.match(cols, /Connection strength/)
  assert.match(cols, /applyColumnOrder/)
  assert.match(cols, /LEAD_COLUMN_ORDER_KEY/)
  assert.match(cols, /'first_name',\s*'last_name',\s*'company',\s*'categories',\s*'opener',\s*'lead_facts',\s*'vertical'/)
  assert.match(records, /flex-wrap: nowrap|records-tags/)
  assert.match(records, /records-facts/)
  const undo = readFileSync(resolve(root, 'src/components/UndoProvider.tsx'), 'utf8')
  const shell = readFileSync(resolve(root, 'src/components/OperatorShell.tsx'), 'utf8')
  assert.match(undo, /metaKey/)
  assert.match(shell, /UndoProvider/)
})


test('configured record widths govern fixed layout and the CRM view control remains compact', () => {
  const records = readFileSync(resolve(root, 'src/components/ui/records-table.tsx'), 'utf8')
  const table = readFileSync(resolve(root, 'src/components/LeadTable.tsx'), 'utf8')
  const styles = readFileSync(resolve(root, 'src/app/workflow-usability.css'), 'utf8')
  assert.match(records, /84 \+ columns\.reduce\(\(sum, id\) => sum \+ columnWidth\(id, effectiveWidths\), 0\)/)
  assert.match(records, /style=\{\{ width: minWidth, minWidth, tableLayout: 'fixed' \}\}/)
  assert.match(table, /className="compass-input crm-view-select"/)
  assert.match(styles, /\.crm-operating-toolbar \.crm-view-select \{ width:auto; flex:0 0 190px; max-width:100%; \}/)
})
