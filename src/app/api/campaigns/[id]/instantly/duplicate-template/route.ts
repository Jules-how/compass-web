import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { InstantlyApiError, resolveInstantlyApiKey } from '@/lib/instantly'
import { duplicateFillCaptureTemplate, loadPipelineCampaign } from '@/lib/instantly-push'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  let body: { name?: string; templateId?: string } = {}
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
    const result = await duplicateFillCaptureTemplate({
      supabase,
      apiKey,
      name: (typeof body.name === 'string' && body.name.trim()) || campaign.name,
      campaign,
      templateId: typeof body.templateId === 'string' ? body.templateId.trim() : undefined
    })
    return portalJson({
      ok: true,
      instantlyCampaignId: result.instantlyCampaignId,
      templateId: result.templateId,
      name: result.name,
      bound: result.bound,
      campaign: result.campaign
    })
  } catch (err) {
    if (err instanceof InstantlyApiError) {
      return portalJson({ error: 'instantly_failed', detail: err.message }, { status: err.status })
    }
    return portalAccessResponse(err) ?? portalJson({ error: 'duplicate_failed' }, { status: 500 })
  }
}
