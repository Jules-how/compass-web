import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import {
  getInstantlyApiKey,
  InstantlyApiError,
  loadColdEmailGlanceFromInstantly
} from '@/lib/instantly'
import { HOME_COLD_EMAIL_DEMO } from '@/lib/home-demo-data'

export const dynamic = 'force-dynamic'

/**
 * GET /api/instantly/cold-email — Home cold-email glance from Instantly.ai.
 * Requires operator portal access. Returns live metrics when INSTANTLY_API_KEY
 * is set; otherwise falls back to demo data with `source: "demo"`.
 */
export async function GET() {
  try {
    await requirePortalAccess({ operator: true })

    const apiKey = getInstantlyApiKey()
    if (!apiKey) {
      return portalJsonCached({
        ...HOME_COLD_EMAIL_DEMO,
        source: 'demo' as const,
        warning: 'INSTANTLY_API_KEY is not configured'
      })
    }

    const glance = await loadColdEmailGlanceFromInstantly(apiKey)
    return portalJsonCached({ ...glance, source: 'instantly' as const })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access

    if (err instanceof InstantlyApiError) {
      return portalJson(
        {
          error: 'instantly_unavailable',
          detail: err.message,
          source: 'error' as const
        },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
      )
    }

    return portalJson({ error: 'fetch_failed', source: 'error' as const }, { status: 500 })
  }
}
