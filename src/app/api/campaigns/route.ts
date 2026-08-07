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
  emptyCampaignCopyFields,
  normalizeCampaignHealth,
  normalizeCampaignStatus,
  normalizeLabels,
  projectCampaignCopy,
  type CompassCampaign
} from '@/lib/campaigns'

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
  const end = body.end_date || start

  const row = {
    id: `campaign-${crypto.randomUUID()}`,
    name,
    status: normalizeCampaignStatus(body.status),
    priority: typeof body.priority === 'number' ? body.priority : 0,
    health: normalizeCampaignHealth(body.health),
    start_date: start,
    end_date: end < start ? start : end,
    color: body.color?.trim() || '#94a3b8',
    summary: body.summary?.trim() || null,
    labels: normalizeLabels(body.labels),
    owner_label: body.owner_label?.trim() || null,
    ...emptyCampaignCopyFields(),
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
