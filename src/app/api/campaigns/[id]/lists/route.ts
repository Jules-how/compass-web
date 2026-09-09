import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { listCrmLists, replaceCampaignLists } from '@/lib/lead-lists'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_campaign_lists')
      .select('list_id')
      .eq('campaign_id', id)
    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 400 })
    const attached = new Set((data ?? []).map((row) => String(row.list_id)))
    const lists = (await listCrmLists(supabase)).filter((row) => attached.has(row.id))
    return portalJson({ list_ids: Array.from(attached), lists })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  let body: { list_ids?: unknown }
  try {
    body = (await readBoundedJson(request, 32 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const listIds = Array.isArray(body.list_ids)
    ? body.list_ids.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : null
  if (!listIds) return portalJson({ error: 'list_ids_required' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data: campaign, error: campaignError } = await supabase
      .from('compass_pipeline_campaigns')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (campaignError) {
      return portalJson({ error: 'update_failed', detail: campaignError.message }, { status: 400 })
    }
    if (!campaign) return portalJson({ error: 'not_found' }, { status: 404 })
    const next = await replaceCampaignLists(supabase, id, listIds)
    return portalJson({ ok: true, list_ids: next })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}
