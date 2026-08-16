import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, requireSameOrigin } from '@/lib/portal-http'
import { InstantlyApiError, resolveInstantlyApiKey } from '@/lib/instantly'
import { loadPipelineCampaign, pushSequenceToInstantly } from '@/lib/instantly-push'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const campaign = await loadPipelineCampaign(supabase, id)
    if (!campaign) return portalJson({ error: 'not_found' }, { status: 404 })
    const apiKey = await resolveInstantlyApiKey(supabase)
    if (!apiKey) return portalJson({ error: 'instantly_not_configured' }, { status: 503 })
    const result = await pushSequenceToInstantly({ apiKey, campaign })
    return portalJson({ ok: true, ...result })
  } catch (err) {
    if (err instanceof InstantlyApiError) {
      return portalJson({ error: 'instantly_failed', detail: err.message }, { status: err.status })
    }
    return portalAccessResponse(err) ?? portalJson({ error: 'push_failed' }, { status: 500 })
  }
}
