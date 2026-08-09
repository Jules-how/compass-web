import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import {
  buildDemoSequenceCampaignAnalytics,
  getInstantlyApiKey,
  InstantlyApiError,
  loadSequenceCampaignAnalytics
} from '@/lib/instantly'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/instantly/campaigns/[id]/analytics — per-campaign Instantly metrics
 * for the sequence editor Analytics tab. `id` is the Instantly campaign UUID
 * (Compass `instantly_campaign_id`). Falls back to demo data when the API key
 * is unset.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    await requirePortalAccess({ operator: true })

    const { id: rawId } = await context.params
    const id = decodeURIComponent(rawId || '').trim()
    if (!id) {
      return portalJson({ error: 'missing_campaign_id', source: 'error' as const }, { status: 400 })
    }

    const apiKey = getInstantlyApiKey()
    if (!apiKey) {
      return portalJsonCached({
        ...buildDemoSequenceCampaignAnalytics(id),
        source: 'demo' as const,
        warning: 'INSTANTLY_API_KEY is not configured'
      })
    }

    const analytics = await loadSequenceCampaignAnalytics(id, apiKey)
    return portalJsonCached({ ...analytics, source: 'instantly' as const }, {}, 60)
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access

    if (err instanceof InstantlyApiError) {
      const status = err.status >= 400 && err.status < 600 ? err.status : 502
      return portalJson(
        {
          error: status === 404 ? 'campaign_not_found' : 'instantly_unavailable',
          detail: err.message,
          source: 'error' as const
        },
        { status }
      )
    }

    return portalJson({ error: 'fetch_failed', source: 'error' as const }, { status: 500 })
  }
}
