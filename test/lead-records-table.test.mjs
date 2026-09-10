import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTypescript } from './helpers/load-typescript.mjs'

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


test('record table fills the workspace while retaining configured column minimums', () => {
  const { default: RecordsTable } = loadTypescript('src/components/ui/records-table.tsx', {
    '@/components/LeadColumnPicker': { LeadColumnPicker: () => null },
  })
  const html = renderToStaticMarkup(React.createElement(RecordsTable, {
    leads: [],
    columns: ['company', 'email'],
    widths: { company: 420, email: 260 },
    onResizeColumn: () => {},
    selected: new Set(),
    onToggleRow: () => {},
    onToggleAll: () => {},
  }))
  // Fill available room, but horizontally scroll rather than squeeze the chosen
  // widths when the viewport is smaller than the index + configured columns.
  assert.match(html, /<table[^>]+style="width:100%;min-width:764px;table-layout:fixed"/)
  assert.match(html, /<col style="width:84px"/)
  assert.match(html, /<col style="width:420px"/)
  assert.match(html, /<col style="width:260px"/)
  const table = readFileSync(resolve(root, 'src/components/LeadTable.tsx'), 'utf8')
  const styles = readFileSync(resolve(root, 'src/app/crm-reports.css'), 'utf8')
  assert.match(table, /className="compass-input crm-view-select"/)
  assert.match(styles, /\.crm-operating-toolbar \.crm-view-select \{ width:auto; max-width:210px;/)
})
