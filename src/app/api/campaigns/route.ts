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
  CAMPAIGN_COLORS,
  CAMPAIGN_LIST_COLUMNS,
  emptyCampaignCopyFields,
  normalizeCampaignHealth,
  normalizeCampaignStatus,
  normalizeLabels,
  normalizeOutboundTagList,
  projectCampaignCopy,
  type CompassCampaign
} from '@/lib/campaigns'
import {
  coldExpressionFromSequence,
  isValidSequence,
  normalizeCopyStatus,
  type OutboundSequence
} from '@/lib/outbound-copy'

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
      .order('start_date', { ascending: true })
      .order('name')

    if (error) {
      return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    }

    return portalJsonCached({
      campaigns: ((data ?? []) as CompassCampaign[]).map(projectCampaign)
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: {
    id?: string
    name?: string
    status?: string
    priority?: number
    health?: string
    start_date?: string | null
    end_date?: string | null
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
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) return portalJson({ error: 'name_required' }, { status: 400 })

  const stamp = nowIso()
  const today = stamp.slice(0, 10)
  const start = body.start_date || today
  let end = body.end_date || start
  if (end < start) end = start

  const requestedId = typeof body.id === 'string' ? body.id.trim() : ''
  const id =
    requestedId && /^campaign-[0-9a-f-]{8,}$/i.test(requestedId)
      ? requestedId
      : `campaign-${crypto.randomUUID()}`

  const copyFields = emptyCampaignCopyFields()
  if (body.instantly_campaign_id !== undefined) {
    copyFields.instantly_campaign_id = body.instantly_campaign_id?.trim() || null
  }
  if (body.offer_key !== undefined) copyFields.offer_key = body.offer_key?.trim() || null
  if (body.structure_id !== undefined) copyFields.structure_id = body.structure_id?.trim() || null
  if (body.opener_mode !== undefined) {
    copyFields.opener_mode = body.opener_mode?.trim() || 'nick-tier'
  }
  if (body.vertical_tags !== undefined) {
    copyFields.vertical_tags = normalizeOutboundTagList(body.vertical_tags)
  }
  if (body.location_tags !== undefined) {
    copyFields.location_tags = normalizeOutboundTagList(body.location_tags)
  }
  if (body.cold_expression !== undefined) {
    copyFields.cold_expression = body.cold_expression?.trim() || null
  }
  if (body.sequence_draft !== undefined) {
    if (body.sequence_draft === null) {
      copyFields.sequence_draft = null
    } else if (!isValidSequence(body.sequence_draft)) {
      return portalJson({ error: 'invalid_sequence' }, { status: 400 })
    } else {
      copyFields.sequence_draft = body.sequence_draft
      copyFields.structure_id = body.sequence_draft.structure_id
      if (body.sequence_draft.offer_key) copyFields.offer_key = body.sequence_draft.offer_key
      const locked = coldExpressionFromSequence(body.sequence_draft)
      if (locked) copyFields.cold_expression = locked
    }
  }
  if (body.copy_status !== undefined) {
    copyFields.copy_status = normalizeCopyStatus(body.copy_status)
  } else if (body.sequence_draft) {
    copyFields.copy_status = 'draft'
  }

  const row = {
    id,
    name,
    status: normalizeCampaignStatus(body.status),
    priority: typeof body.priority === 'number' ? body.priority : 0,
    health: normalizeCampaignHealth(body.health),
    start_date: start,
    end_date: end,
    color:
      body.color?.trim() ||
      CAMPAIGN_COLORS[Math.floor(Math.random() * CAMPAIGN_COLORS.length)],
    summary: body.summary?.trim() || null,
    labels: normalizeLabels(body.labels),
    owner_label: body.owner_label?.trim() || null,
    ...copyFields,
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
