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
  CAMPAIGN_MILESTONE_COLUMNS,
  type CompassCampaignMilestone
} from '@/lib/campaigns'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

function nowIso(): string {
  return new Date().toISOString()
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_pipeline_milestones')
      .select(CAMPAIGN_MILESTONE_COLUMNS)
      .eq('campaign_id', id)
      .order('sort_order')
    if (error) {
      return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    }
    return portalJsonCached({ milestones: (data ?? []) as CompassCampaignMilestone[] })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: campaignId } = await context.params

  let body: {
    milestones?: Array<{
      id?: string
      title?: string
      description?: string | null
      target_date?: string | null
      completed?: boolean
    }>
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const stamp = nowIso()
  const rows = (body.milestones ?? [])
    .map((milestone, index) => {
      const title = milestone.title?.trim()
      if (!title) return null
      return {
        id: milestone.id?.startsWith('milestone-') ? milestone.id : `milestone-${crypto.randomUUID()}`,
        campaign_id: campaignId,
        title,
        description: milestone.description?.trim() || null,
        target_date: milestone.target_date || null,
        sort_order: index,
        completed: Boolean(milestone.completed),
        created_at: stamp,
        updated_at: stamp
      }
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const existing = await supabase
      .from('compass_pipeline_campaigns')
      .select('id')
      .eq('id', campaignId)
      .maybeSingle()
    if (existing.error) {
      return portalJson({ error: 'fetch_failed', detail: existing.error.message }, { status: 500 })
    }
    if (!existing.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const del = await supabase
      .from('compass_pipeline_milestones')
      .delete()
      .eq('campaign_id', campaignId)
    if (del.error) {
      return portalJson({ error: 'update_failed', detail: del.error.message }, { status: 400 })
    }

    if (rows.length > 0) {
      const ins = await supabase.from('compass_pipeline_milestones').insert(rows)
      if (ins.error) {
        return portalJson({ error: 'update_failed', detail: ins.error.message }, { status: 400 })
      }
    }

    await supabase.from('compass_pipeline_activity').insert({
      id: `cact-${crypto.randomUUID()}`,
      campaign_id: campaignId,
      actor: 'operator',
      action: 'milestones',
      body: `Updated milestones (${rows.length})`,
      created_at: stamp
    })

    const { data, error } = await supabase
      .from('compass_pipeline_milestones')
      .select(CAMPAIGN_MILESTONE_COLUMNS)
      .eq('campaign_id', campaignId)
      .order('sort_order')
    if (error) {
      return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    }

    return portalJson({ milestones: (data ?? []) as CompassCampaignMilestone[] })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}
