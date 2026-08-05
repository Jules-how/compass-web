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
  CAMPAIGN_ACTIVITY_COLUMNS,
  CAMPAIGN_LIST_COLUMNS,
  CAMPAIGN_MILESTONE_COLUMNS,
  normalizeCampaignHealth,
  normalizeCampaignStatus,
  normalizeLabels,
  type CompassCampaign,
  type CompassCampaignActivity,
  type CompassCampaignMilestone
} from '@/lib/campaigns'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

function nowIso(): string {
  return new Date().toISOString()
}

function projectCampaign(row: CompassCampaign): CompassCampaign {
  return {
    ...row,
    labels: Array.isArray(row.labels) ? row.labels : [],
    priority: typeof row.priority === 'number' ? row.priority : 0,
    health: row.health || 'no_updates',
    color: row.color || '#94a3b8'
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [campaignRes, milestonesRes, activityRes] = await Promise.all([
      supabase.from('compass_pipeline_campaigns').select(CAMPAIGN_LIST_COLUMNS).eq('id', id).maybeSingle(),
      supabase
        .from('compass_pipeline_milestones')
        .select(CAMPAIGN_MILESTONE_COLUMNS)
        .eq('campaign_id', id)
        .order('sort_order'),
      supabase
        .from('compass_pipeline_activity')
        .select(CAMPAIGN_ACTIVITY_COLUMNS)
        .eq('campaign_id', id)
        .order('created_at', { ascending: false })
        .limit(40)
    ])

    if (campaignRes.error || milestonesRes.error || activityRes.error) {
      return portalJson({ error: 'fetch_failed' }, { status: 500 })
    }
    if (!campaignRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    return portalJsonCached({
      campaign: projectCampaign(campaignRes.data as CompassCampaign),
      milestones: (milestonesRes.data ?? []) as CompassCampaignMilestone[],
      activity: (activityRes.data ?? []) as CompassCampaignActivity[]
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

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

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const existingRes = await supabase
      .from('compass_pipeline_campaigns')
      .select(CAMPAIGN_LIST_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (existingRes.error) {
      return portalJson({ error: 'fetch_failed', detail: existingRes.error.message }, { status: 500 })
    }
    if (!existingRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const existing = projectCampaign(existingRes.data as CompassCampaign)
    const stamp = nowIso()
    const patch: Record<string, unknown> = { updated_at: stamp }
    const activity: Array<{ action: string; body: string }> = []

    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
      if (name !== existing.name) {
        patch.name = name
        activity.push({ action: 'renamed', body: `Renamed to “${name}”` })
      }
    }
    if (body.status !== undefined) {
      const status = normalizeCampaignStatus(body.status)
      if (status !== existing.status) {
        patch.status = status
        activity.push({ action: 'status', body: `Changed status to ${status}` })
      }
    }
    if (typeof body.priority === 'number' && body.priority !== existing.priority) {
      patch.priority = body.priority
      activity.push({ action: 'priority', body: `Changed priority` })
    }
    if (body.health !== undefined) {
      const health = normalizeCampaignHealth(body.health)
      if (health !== existing.health) {
        patch.health = health
        activity.push({ action: 'health', body: `Changed health to ${health}` })
      }
    }
    if (body.start_date !== undefined) {
      const start = body.start_date || null
      if (start !== existing.start_date) {
        patch.start_date = start
        activity.push({
          action: 'dates',
          body: `Changed start date to ${start ?? 'none'}`
        })
      }
    }
    if (body.end_date !== undefined) {
      const end = body.end_date || null
      if (end !== existing.end_date) {
        patch.end_date = end
        activity.push({
          action: 'dates',
          body: `Changed end date to ${end ?? 'none'}`
        })
      }
    }
    if (typeof body.color === 'string' && body.color.trim()) {
      patch.color = body.color.trim()
    }
    if (body.summary !== undefined) {
      patch.summary = body.summary?.trim() || null
    }
    if (body.labels !== undefined) {
      patch.labels = normalizeLabels(body.labels)
    }
    if (body.owner_label !== undefined) {
      patch.owner_label = body.owner_label?.trim() || null
    }

    // Keep end >= start when both present after patch.
    const nextStart =
      (patch.start_date as string | null | undefined) !== undefined
        ? (patch.start_date as string | null)
        : existing.start_date
    const nextEnd =
      (patch.end_date as string | null | undefined) !== undefined
        ? (patch.end_date as string | null)
        : existing.end_date
    if (nextStart && nextEnd && nextEnd < nextStart) {
      patch.end_date = nextStart
    }

    const { data, error } = await supabase
      .from('compass_pipeline_campaigns')
      .update(patch)
      .eq('id', id)
      .select(CAMPAIGN_LIST_COLUMNS)
      .single()

    if (error) {
      return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    }

    if (activity.length > 0) {
      await supabase.from('compass_pipeline_activity').insert(
        activity.map((item) => ({
          id: `cact-${crypto.randomUUID()}`,
          campaign_id: id,
          actor: 'operator',
          action: item.action,
          body: item.body,
          created_at: stamp
        }))
      )
    }

    return portalJson(projectCampaign(data as CompassCampaign))
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { error } = await supabase.from('compass_pipeline_campaigns').delete().eq('id', id)
    if (error) {
      return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })
    }
    return portalJson({ ok: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
