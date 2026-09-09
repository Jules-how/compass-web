import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

const INSTANTLY_CLASSIFY_ACTIONS = [
  { id: 'positive', label: 'Positive', outboundStatus: 'interested', tag: null },
  { id: 'not_now', label: 'Not now', outboundStatus: 'not_interested', tag: null },
  { id: 'wrong_person', label: 'Wrong person', outboundStatus: 'wrong_person', tag: null },
  { id: 'bad_offer', label: 'Bad offer', outboundStatus: 'not_interested', tag: 'bad_offer' },
  { id: 'ooo', label: 'OOO', outboundStatus: 'out_of_office', tag: null }
]

function classifyAction(id) {
  return INSTANTLY_CLASSIFY_ACTIONS.find((row) => row.id === id) ?? null
}

test('Instantly classify maps to outbound_status and optional tag', () => {
  assert.equal(classifyAction('positive').outboundStatus, 'interested')
  assert.equal(classifyAction('not_now').outboundStatus, 'not_interested')
  assert.equal(classifyAction('wrong_person').outboundStatus, 'wrong_person')
  assert.equal(classifyAction('bad_offer').outboundStatus, 'not_interested')
  assert.equal(classifyAction('bad_offer').tag, 'bad_offer')
  assert.equal(classifyAction('ooo').outboundStatus, 'out_of_office')
  assert.equal(classifyAction('nope'), null)
})

test('Inbox Instantly classify then marks triage done and deep-links Unibox', () => {
  const panel = read('src/components/InboxPanel.tsx')
  assert.match(panel, /INSTANTLY_CLASSIFY_ACTIONS/)
  assert.match(panel, /onClassify/)
  assert.match(panel, /patchTriage\(selected, 'done'\)/)
  assert.match(panel, /\/api\/leads\/bulk/)
  assert.match(panel, /Unibox/)
  assert.match(panel, /Gmail/)

  const ui = read('src/lib/inbox-ui.ts')
  assert.match(ui, /INSTANTLY_UNIBOX/)
  assert.match(ui, /gmailSearchUrl/)
  assert.match(ui, /crmHref/)

  const bulk = read('src/app/api/leads/bulk/route.ts')
  assert.match(bulk, /isClassifyOutboundStatus/)

  const home = read('src/components/home/FolioHome.tsx')
  assert.match(home, /\/inbox\?tab=/)
})
