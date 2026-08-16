import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { InstantlyApiError, resolveInstantlyApiKey } from '@/lib/instantly'
import { ensureInstantlyCampaign, loadPipelineCampaign } from '@/lib/instantly-push'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  let body: { pushSequence?: boolean } = {}
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      body = (await readBoundedJson(request, 8 * 1024)) as typeof body
    }
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const campaign = await loadPipelineCampaign(supabase, id)
    if (!campaign) return portalJson({ error: 'not_found' }, { status: 404 })
    const apiKey = await resolveInstantlyApiKey(supabase)
    if (!apiKey) return portalJson({ error: 'instantly_not_configured' }, { status: 503 })
    const result = await ensureInstantlyCampaign({
      supabase,
      campaign,
      apiKey,
      pushSequence: body.pushSequence === true
    })
    return portalJson({
      ok: true,
      created: result.created,
      instantlyCampaignId: result.instantlyCampaignId,
      campaign: result.campaign
    })
  } catch (err) {
    if (err instanceof InstantlyApiError) {
      return portalJson({ error: 'instantly_failed', detail: err.message }, { status: err.status })
    }
    return portalAccessResponse(err) ?? portalJson({ error: 'ensure_failed' }, { status: 500 })
  }
}
