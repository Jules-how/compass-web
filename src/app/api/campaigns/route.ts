import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  CAMPAIGN_LIST_COLUMNS,
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
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_pipeline_campaigns')
      .select(CAMPAIGN_LIST_COLUMNS)
      .order('go_live_at', { ascending: true })
      .order('name')

    if (error) {
      return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    }

    const campaigns = ((data ?? []) as CompassCampaign[]).map(projectCampaign)
    const ids = campaigns.map((row) => row.id)
    let tallies: Record<string, { cohort: number; positive: number; meetings: number }> = {}
    if (ids.length > 0) {
      const leadsRes = await supabase
        .from('lead_contacts')
        .select('pipeline_campaign_id,outbound_status')
        .in('pipeline_campaign_id', ids)
        .limit(8000)
      if (!leadsRes.error) {
        tallies = tallyLeadsByCampaign(leadsRes.data ?? [])
      }
    }

    return portalJsonCached({
      campaigns: applyLeadTallies(campaigns, tallies)
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
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
  const parsedGoLive = parseGoLiveAt(body.go_live_at === undefined ? defaultGoLiveAt() : body.go_live_at)
  if (!parsedGoLive.ok) return portalJson({ error: 'invalid_go_live_at' }, { status: 400 })
  const goLiveAt = parsedGoLive.iso || defaultGoLiveAt()
  const today = stamp.slice(0, 10)
  const start = body.start_date || dateOnlyInZone(goLiveAt) || today
  const end = body.end_date || start
  const copyDefaults = emptyCampaignCopyFields()
  const sequenceDraft = body.sequence_draft ?? null
  const lockedExpression =
    (sequenceDraft && coldExpressionFromSequence(sequenceDraft)) ||
    body.cold_expression?.trim() ||
    null

  const row = {
    id: `campaign-${crypto.randomUUID()}`,
    name,
    status: normalizeCampaignStatus(body.status),
    priority: typeof body.priority === 'number' ? body.priority : 0,
    health: normalizeCampaignHealth(body.health),
    start_date: start,
    end_date: end < start ? start : end,
    go_live_at: goLiveAt,
    color: body.color?.trim() || '#94a3b8',
    summary: body.summary?.trim() || null,
    labels: normalizeLabels(body.labels),
    owner_label: body.owner_label?.trim() || null,
    ...copyDefaults,
    instantly_campaign_id: body.instantly_campaign_id?.trim() || null,
    offer_key: body.offer_key?.trim() || sequenceDraft?.offer_key || null,
    structure_id: body.structure_id?.trim() || sequenceDraft?.structure_id || null,
    opener_mode: body.opener_mode?.trim() || copyDefaults.opener_mode,
    vertical_tags: normalizeOutboundTagList(body.vertical_tags),
    location_tags: normalizeOutboundTagList(body.location_tags),
    cold_expression: lockedExpression,
    sequence_draft: sequenceDraft,
    copy_status: normalizeCopyStatus(
      body.copy_status || (sequenceDraft ? 'draft' : copyDefaults.copy_status)
    ),
    created_at: stamp,
    updated_at: stamp
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_pipeline_campaigns')
      .insert(row)
      .select(CAMPAIGN_LIST_COLUMNS)
      .single()

    if (error) {
      return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
    }

    await supabase.from('compass_pipeline_activity').insert({
      id: `cact-${crypto.randomUUID()}`,
      campaign_id: row.id,
      actor: 'operator',
      action: 'created',
      body: `Created campaign “${name}”`,
      created_at: stamp
    })

    return portalJson(projectCampaign(data as CompassCampaign), { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
