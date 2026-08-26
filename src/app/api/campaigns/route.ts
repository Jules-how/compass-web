import type { NextRequest } from 'next/server'
import {
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  dateOnlyInZone,
  defaultGoLiveAt,
  emptyCampaignCopyFields,
  normalizeCampaignHealth,
  normalizeCampaignStatus,
  normalizeLabels,
  normalizeOutboundTagList,
  parseGoLiveAt,
  projectCampaignCopy,
  type CompassCampaign
} from '@/lib/campaigns'
import {
  coldExpressionFromSequence,
  isValidSequence,
  normalizeCopyStatus,
  type OutboundSequence
} from '@/lib/outbound-copy'
import { applyLeadTallies, tallyLeadsByCampaign } from '@/lib/campaign-wave'
import {
  getLocalDb,
  getPipelineCampaigns,
  upsertPipelineCampaign,
  addPipelineActivity
} from '@/lib/local-db'

export const dynamic = 'force-dynamic'

function nowIso(): string {
  return new Date().toISOString()
}

function projectCampaign(row: CompassCampaign): CompassCampaign {
  return projectCampaignCopy({
    ...emptyCampaignCopyFields(),
    ...row,
    labels: Array.isArray(row.labels) ? row.labels : [],
    priority: typeof row.priority === 'number' ? row.priority : 0,
    health: row.health || 'no_updates',
    color: row.color || '#94a3b8'
  })
}

export async function GET() {
  try {
    const db = getLocalDb()
    const campaigns = getPipelineCampaigns().map(projectCampaign)

    const leads = db.prepare(`
      SELECT pipeline_campaign_id, outbound_status, opener
      FROM lead_contacts
      WHERE pipeline_campaign_id IS NOT NULL
    `).all() as Array<{ pipeline_campaign_id: string; outbound_status: string; opener: string | null }>

    const tallies = tallyLeadsByCampaign(leads)

    return portalJsonCached({
      campaigns: applyLeadTallies(campaigns, tallies)
    }, {}, 5)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch_failed'
    return portalJson({ error: 'fetch_failed', detail: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: {
    name?: string
    status?: string
    priority?: number
    health?: string
    start_date?: string | null
    end_date?: string | null
    go_live_at?: string | null
    color?: string
    summary?: string | null
    labels?: string[]
    owner_label?: string | null
    instantly_campaign_id?: string | null
    offer_key?: string | null
    structure_id?: string | null
    opener_mode?: string | null
    vertical_tags?: string[]
    location_tags?: string[]
    cold_expression?: string | null
    sequence_draft?: OutboundSequence | null
    copy_status?: string
  }
  try {
    body = (await readBoundedJson(request, 256 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) return portalJson({ error: 'name_required' }, { status: 400 })

  if (body.sequence_draft != null && !isValidSequence(body.sequence_draft)) {
    return portalJson({ error: 'invalid_sequence' }, { status: 400 })
  }

  const stamp = nowIso()
  const parsedGoLiveRes = parseGoLiveAt(body.go_live_at === undefined ? defaultGoLiveAt() : body.go_live_at)
  const parsedGoLive = parsedGoLiveRes.ok ? parsedGoLiveRes.iso : null
  const inferredStartDate = parsedGoLive ? dateOnlyInZone(parsedGoLive) : null
  const startDate = body.start_date !== undefined ? body.start_date : inferredStartDate

  const inferredColdExpression =
    body.cold_expression !== undefined
      ? body.cold_expression
      : body.sequence_draft
        ? coldExpressionFromSequence(body.sequence_draft)
        : null

  const row = {
    id: `campaign-${crypto.randomUUID()}`,
    name,
    status: normalizeCampaignStatus(body.status),
    priority: typeof body.priority === 'number' ? body.priority : 0,
    health: normalizeCampaignHealth(body.health),
    start_date: startDate,
    end_date: body.end_date ?? null,
    go_live_at: parsedGoLive,
    color: body.color || '#94a3b8',
    summary: body.summary ?? null,
    labels: normalizeLabels(body.labels),
    owner_label: body.owner_label ?? null,
    instantly_campaign_id: body.instantly_campaign_id?.trim() || null,
    offer_key: body.offer_key?.trim() || null,
    structure_id: body.structure_id?.trim() || null,
    opener_mode: body.opener_mode?.trim() || null,
    vertical_tags: normalizeOutboundTagList(body.vertical_tags),
    location_tags: normalizeOutboundTagList(body.location_tags),
    copy_status: normalizeCopyStatus(body.copy_status),
    cold_expression: inferredColdExpression,
    sequence_draft: body.sequence_draft ?? null,
    created_at: stamp,
    updated_at: stamp
  }

  try {
    const created = upsertPipelineCampaign(row)
    addPipelineActivity(created.id, 'campaign_created', `Campaign "${created.name}" created`, {
      name: created.name
    })

    return portalJson({ campaign: projectCampaign(created) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'create_failed'
    return portalJson({ error: 'create_failed', detail: message }, { status: 500 })
  }
}
