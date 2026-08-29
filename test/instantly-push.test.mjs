import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function splitPersonName(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') }
}

function leadContactToInstantlyLead(lead) {
  const email = (lead.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return null
  const { firstName, lastName } = splitPersonName(lead.name)
  const opener = (lead.opener || '').trim()
  const custom = {}
  if (opener) {
    custom.opener = opener
    custom.personalization = opener
  }
  const payload = { email }
  if (firstName) payload.first_name = firstName
  if (lastName) payload.last_name = lastName
  if ((lead.company || '').trim()) payload.company_name = lead.company.trim()
  if (opener) payload.personalization = opener
  if (Object.keys(custom).length) payload.custom_variables = custom
  return payload
}

function textToInstantlyHtml(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<div>${escaped.replace(/\r\n|\n|\r/g, '<br/>')}</div>`
}

function classifyPushSkip(lead, instantlyCampaignId, requireOpener) {
  const email = (lead.email || '').trim()
  if (!email || !email.includes('@')) return 'no_email'
  if (lead.outbound_status === 'suppressed' || lead.suppression_reason) return 'suppressed'
  if (['replied', 'interested', 'meeting_booked', 'converted'].includes(lead.outbound_status)) {
    return 'hot'
  }
  if ((lead.instantly_campaign_id || '').trim() === (instantlyCampaignId || '').trim()) {
    return 'already_in_campaign'
  }
  if (requireOpener && !(lead.opener || '').trim()) return 'missing_opener'
  return null
}

test('lead mapper sends names, opener, and Instantly custom vars', () => {
  const payload = leadContactToInstantlyLead({
    name: 'Ada Lovelace',
    email: 'Ada@Example.com',
    company: 'Analytical Engines',
    opener: 'You just hired two brokers in Parramatta.'
  })
  assert.equal(payload.email, 'ada@example.com')
  assert.equal(payload.first_name, 'Ada')
  assert.equal(payload.last_name, 'Lovelace')
  assert.equal(payload.company_name, 'Analytical Engines')
  assert.equal(payload.personalization, 'You just hired two brokers in Parramatta.')
  assert.equal(payload.custom_variables.opener, payload.personalization)
})

test('lead mapper omits first_name when no person name and still sends opener as a custom var', () => {
  const payload = leadContactToInstantlyLead({
    email: 'info@shop.com.au',
    company: 'Shop',
    opener: 'Shop in Auburn lists Hipages on the site.'
  })
  assert.equal(payload.first_name, undefined)
  assert.equal(payload.personalization, 'Shop in Auburn lists Hipages on the site.')
  assert.equal(payload.custom_variables.opener, payload.personalization)
  assert.equal(payload.opener, undefined)
})

test('lead mapper skips rows without a usable email', () => {
  assert.equal(leadContactToInstantlyLead({ name: 'No Mail', email: '' }), null)
})

test('sequence HTML preserves tokens and line breaks', () => {
  const html = textToInstantlyHtml('Hey {{firstName}},\n{{opener}}')
  assert.match(html, /{{firstName}}/)
  assert.match(html, /<br\/>/)
  assert.doesNotMatch(html, /&lt;&lt;/)
})

test('push skip reasons cover hygiene cases', () => {
  const id = 'inst-1'
  assert.equal(classifyPushSkip({ email: '' }, id, true), 'no_email')
  assert.equal(classifyPushSkip({ email: 'a@b.com', suppression_reason: 'unsub' }, id, true), 'suppressed')
  assert.equal(
    classifyPushSkip({ email: 'a@b.com', outbound_status: 'interested' }, id, true),
    'hot'
  )
  assert.equal(
    classifyPushSkip({ email: 'a@b.com', opener: 'x', instantly_campaign_id: id }, id, true),
    'already_in_campaign'
  )
  assert.equal(classifyPushSkip({ email: 'a@b.com', opener: '' }, id, true), 'missing_opener')
  assert.equal(classifyPushSkip({ email: 'a@b.com', opener: 'hi' }, id, true), null)
})

test('Instantly write + push libs and routes are wired', () => {
  const write = read('src/lib/instantly-write.ts')
  assert.match(write, /\/leads\/add/)
  assert.match(write, /verify_leads_on_import/)
  assert.match(write, /skip_if_in_workspace/)
  const push = read('src/lib/instantly-push.ts')
  assert.match(push, /leadContactToInstantlyLead/)
  assert.match(push, /custom_variables/)
  assert.match(push, /if \(firstName\) payload\.first_name = firstName/)
  assert.match(push, /outboundSequenceToInstantlySequences/)
  assert.match(push, /ensureInstantlyCampaign/)
  assert.match(push, /pushLeadsToInstantly/)
  assert.match(push, /enrich_status: 'uploaded'/)
  assert.doesNotMatch(push, /activate_campaign/)

  for (const rel of [
    'src/app/api/campaigns/[id]/instantly/ensure/route.ts',
    'src/app/api/campaigns/[id]/instantly/push-leads/route.ts',
    'src/app/api/campaigns/[id]/instantly/push-sequence/route.ts',
    'src/app/api/agent/instantly/ensure/route.ts',
    'src/app/api/agent/instantly/push-leads/route.ts',
    'src/app/api/agent/instantly/push-sequence/route.ts'
  ]) {
    const src = read(rel)
    assert.match(src, /export async function POST/)
    assert.doesNotMatch(src, /export function /)
  }

  const agentEnsure = read('src/app/api/agent/instantly/ensure/route.ts')
  assert.match(agentEnsure, /requireAgentAuth/)
  const opPush = read('src/app/api/campaigns/[id]/instantly/push-leads/route.ts')
  assert.match(opPush, /requireSameOrigin/)
  assert.match(opPush, /requirePortalAccess/)
})

test('editor Launch is a paused Instantly push, not activate', () => {
  const editor = read('src/components/outbound/SequenceEditor.tsx')
  assert.match(editor, /Push to Instantly/)
  assert.match(editor, /ensureInstantlyCampaign/)
  assert.match(editor, /pushInstantlyLeads/)
  assert.match(editor, /Activate stays in Instantly/)
  const panel = read('src/components/outbound/CampaignInstantlyPanel.tsx')
  assert.match(panel, /Push leads/)
  assert.match(panel, /dryRun/)
})
