import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CRM_DEFAULT_COLUMNS, CAMPAIGN_DEFAULT_COLUMNS, LEAD_COLUMN_DEFS,
  resolveVisibleLeadColumns, pinnedKeyFor, hiddenKeyFor, orderKeyFor,
  loadPinnedLeadColumns, persistPinnedLeadColumns, loadLeadColumnWidths,
  persistLeadColumnWidths, defaultColumnsFor
} from '../src/lib/lead-columns.ts'

test('Operating view stays compact when research and category data are populated', () => {
  const visible = resolveVisibleLeadColumns({ preset: 'crm', occupied: LEAD_COLUMN_DEFS.map(c => c.id), pinned: [], hidden: [] })
  assert.deepEqual(visible, CRM_DEFAULT_COLUMNS)
  assert.ok(visible.includes('phone'))
  assert.ok(!visible.includes('first_name'))
  assert.deepEqual(resolveVisibleLeadColumns({ preset: 'crm', occupied: [], pinned: ['opener'], hidden: ['email'] }), [...CRM_DEFAULT_COLUMNS.filter(id => id !== 'email'), 'opener'])
  assert.deepEqual(defaultColumnsFor('campaign'), CAMPAIGN_DEFAULT_COLUMNS)
})

test('Operating customizations leave legacy column and width preferences intact', () => {
  const values = new Map()
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
  try {
    values.set(pinnedKeyFor('crm-legacy'), JSON.stringify(['opener', 'phone']))
    values.set(hiddenKeyFor('crm-legacy'), JSON.stringify(['email']))
    values.set(orderKeyFor('crm-legacy'), JSON.stringify(['phone', 'company']))
    persistLeadColumnWidths({ categories: 850 }, 'crm-legacy')
    const before = new Map(values)
    persistPinnedLeadColumns(['status'], 'crm')
    persistLeadColumnWidths({ phone: 155 }, 'crm')
    for (const [key, value] of before) assert.equal(values.get(key), value)
    assert.deepEqual(loadPinnedLeadColumns('crm-legacy'), ['opener', 'phone'])
    assert.deepEqual(loadPinnedLeadColumns('crm'), ['status'])
    assert.deepEqual(loadLeadColumnWidths('crm'), { phone: 155 })
    assert.deepEqual(loadLeadColumnWidths('crm-legacy'), { categories: 850 })
  } finally { delete globalThis.window }
})
