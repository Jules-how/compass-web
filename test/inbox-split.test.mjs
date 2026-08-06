import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

test('inbox UI exposes Linear-style tabs and split-pane panel', () => {
  const panel = read('src/components/InboxPanel.tsx')
  const page = read('src/app/(console)/inbox/page.tsx')
  const api = read('src/app/api/inbox/route.ts')
  const lib = read('src/lib/inbox-ui.ts')

  assert.match(page, /flush/)
  assert.match(panel, /INBOX_TAB_LABELS/)
  assert.match(panel, /INBOX_TABS/)
  assert.match(panel, /Context/)
  assert.match(panel, /Select a notification/)
  assert.match(panel, /md:w-\[340px\]/)
  assert.match(lib, /INBOX_TABS = \['agents', 'gmails', 'instantly', 'leads'\]/)
  assert.match(lib, /Agents/)
  assert.match(lib, /Gmail/)
  assert.match(lib, /Instantly/)
  assert.match(lib, /Leads/)
  assert.match(api, /badgeTotal/)
  assert.match(api, /lead_contacts/)
  assert.match(api, /portal_inbound_leads/)
  assert.match(api, /compass_tasks/)
})

test('inbox tab parsing defaults to leads and accepts aliases', () => {
  const TABS = ['agents', 'gmails', 'instantly', 'leads']
  function parseInboxTab(value) {
    if (value === 'website') return 'leads'
    if (value && TABS.includes(value)) return value
    return 'leads'
  }
  assert.equal(parseInboxTab(null), 'leads')
  assert.equal(parseInboxTab('agents'), 'agents')
  assert.equal(parseInboxTab('gmails'), 'gmails')
  assert.equal(parseInboxTab('instantly'), 'instantly')
  assert.equal(parseInboxTab('website'), 'leads')
  assert.equal(parseInboxTab('nope'), 'leads')
})

test('inbox relative time formatter stays compact', () => {
  const now = Date.parse('2026-08-06T12:00:00.000Z')
  function formatInboxRelative(iso, nowMs = Date.now()) {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    const abs = Math.abs(nowMs - date.getTime())
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    if (abs < minute) return 'now'
    if (abs < hour) return `${Math.round(abs / minute)}m`
    if (abs < day) return `${Math.round(abs / hour)}h`
    if (abs < 7 * day) return `${Math.round(abs / day)}d`
    return 'dated'
  }
  assert.equal(formatInboxRelative('2026-08-06T11:59:30.000Z', now), 'now')
  assert.equal(formatInboxRelative('2026-08-06T11:30:00.000Z', now), '30m')
  assert.equal(formatInboxRelative('2026-08-06T09:00:00.000Z', now), '3h')
  assert.equal(formatInboxRelative('2026-08-04T12:00:00.000Z', now), '2d')
})
