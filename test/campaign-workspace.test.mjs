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

function leadPreviewValues(lead) {
  if (!lead) return {}
  const { firstName, lastName } = splitPersonName(lead.name)
  const opener = (lead.opener || '').trim()
  return {
    firstName,
    lastName,
    companyName: (lead.company || '').trim(),
    opener,
    personalization: opener
  }
}

function tokenizePreview(text, values) {
  const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
  const segments = []
  let last = 0
  let match
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) segments.push({ kind: 'text', text: text.slice(last, match.index) })
    const key = match[1] || ''
    const mapped = Object.prototype.hasOwnProperty.call(values, key)
    const value = mapped ? values[key] : undefined
    if (!mapped || !value) segments.push({ kind: 'missing', key })
    else segments.push({ kind: 'value', key, text: value })
    last = match.index + match[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) })
  return segments
}

function campaignMembershipOrClause(pipelineCampaignId, instantlyCampaignId) {
  const pipeline = pipelineCampaignId?.trim()
  const instantly = instantlyCampaignId?.trim()
  if (!pipeline || !instantly || pipeline === instantly) return null
  return `pipeline_campaign_id.eq.${pipeline},instantly_campaign_id.eq.${instantly}`
}

function isWorkshopCampaign(campaign, liveInstantlyIds) {
  const status = String(campaign.status || '')
  if (status === 'completed' || status === 'cancelled') return false
  const copy = campaign.copy_status || 'none'
  if (copy === 'live') return false
  const instantlyId = (campaign.instantly_campaign_id || '').trim()
  if (instantlyId && liveInstantlyIds.has(instantlyId)) return false
  return copy === 'none' || copy === 'draft' || copy === 'ready'
}

test('preview substitutes opener without inventing unknown tokens', () => {
  const values = leadPreviewValues({
    name: 'Alex Rivera',
    company: 'Tower Mortgage',
    opener: 'Construction loans are uncommon.'
  })
  assert.equal(values.firstName, 'Alex')
  assert.equal(values.lastName, 'Rivera')
  const segments = tokenizePreview(
    'Hey {{firstName}}, {{opener}} {{accountSignature}}',
    values
  )
  assert.deepEqual(
    segments.map((s) => s.kind),
    ['text', 'value', 'text', 'value', 'text', 'missing']
  )
  const opener = segments.find((s) => s.key === 'opener')
  assert.equal(opener.text, 'Construction loans are uncommon.')
  const missing = segments.find((s) => s.key === 'accountSignature')
  assert.equal(missing.kind, 'missing')
})

test('campaign membership ORs pipeline and Instantly ids', () => {
  assert.equal(campaignMembershipOrClause('camp-1', 'inst-9'), 'pipeline_campaign_id.eq.camp-1,instantly_campaign_id.eq.inst-9')
  assert.equal(campaignMembershipOrClause('same', 'same'), null)
  assert.equal(campaignMembershipOrClause('camp-1', ''), null)
})

test('workshop campaigns exclude live Instantly binds', () => {
  const live = new Set(['inst-live'])
  assert.equal(
    isWorkshopCampaign({ status: 'draft', copy_status: 'draft', instantly_campaign_id: null }, live),
    true
  )
  assert.equal(
    isWorkshopCampaign(
      { status: 'active', copy_status: 'ready', instantly_campaign_id: 'inst-live' },
      live
    ),
    false
  )
  assert.equal(
    isWorkshopCampaign({ status: 'completed', copy_status: 'draft' }, live),
    false
  )
})

test('campaign workspace wiring keeps one lead store', () => {
  const query = read('src/lib/leads-query.ts')
  assert.match(query, /export function campaignMembershipOrClause/)
  assert.match(query, /instantly_campaign_id/)
  assert.match(query, /pipeline_campaign_id\.eq/)

  const hub = read('src/components/outbound/OutboundHub.tsx')
  assert.match(hub, /OutboundWorkshopSection/)
  assert.match(hub, /OutboundLiveSection/)

  const live = read('src/components/outbound/OutboundLiveSection.tsx')
  assert.match(live, /editor\/live/)
  assert.match(live, /pipelineCampaignId/)
  assert.match(live, /Reply rate/)

  const editor = read('src/components/outbound/SequenceEditor.tsx')
  assert.match(editor, /CampaignLeadsPane/)
  assert.match(editor, /setPreviewOn/)
  assert.doesNotMatch(editor, /will appear here after launch/)
  assert.match(editor, /Compass copy\. Instantly may differ/)

  const pane = read('src/components/outbound/CampaignLeadsPane.tsx')
  assert.match(pane, /variant="embed"/)
  assert.match(pane, /cohort_campaign_id/)
  assert.match(pane, /instantly_campaign_id/)

  const sidecar = read('src/components/LeadSidecar.tsx')
  assert.match(sidecar, /Research facts/)
  assert.match(sidecar, /No opener yet/)
})

test('campaign list GET skips sequence bodies and tallies the resolved CRM cohort', () => {
  const campaigns = read('src/lib/campaigns.ts')
  assert.match(campaigns, /CAMPAIGN_BOARD_COLUMNS/)
  assert.match(campaigns, /CAMPAIGN_LIST_COLUMNS = `\$\{CAMPAIGN_CORE_COLUMNS\},cold_expression,sequence_draft`/)

  const store = read('src/lib/campaigns-server.ts')
  assert.match(store, /select\(CAMPAIGN_BOARD_COLUMNS\)/)
  assert.match(store, /loadCohortLeadRowsForCampaigns/)
  assert.match(store, /select\(CAMPAIGN_LIST_COLUMNS\)/)

  const list = read('src/app/api/campaigns/route.ts')
  assert.match(list, /listPipelineCampaigns/)
  assert.match(list, /requirePortalAccess/)

  const planner = read('src/components/campaigns/CampaignPlanner.tsx')
  assert.match(planner, /useCachedJson/)
  assert.match(planner, /CAMPAIGNS_QUERY_KEY/)
})
