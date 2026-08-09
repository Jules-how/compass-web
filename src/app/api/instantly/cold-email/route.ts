import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import {
  InstantlyApiError,
  loadColdEmailGlanceFromInstantly,
  resolveInstantlyApiKey
} from '@/lib/instantly'
import { HOME_COLD_EMAIL_DEMO } from '@/lib/home-demo-data'

export const dynamic = 'force-dynamic'

/**
 * GET /api/instantly/cold-email — Home cold-email glance from Instantly.ai.
 * Requires operator portal access. Returns live metrics when an Instantly API
 * key is available via `INSTANTLY_API_KEY` or `compass_settings`; otherwise
 * falls back to demo data with `source: "demo"`.
 */
export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    const apiKey = await resolveInstantlyApiKey(supabase)
    if (!apiKey) {
      return portalJsonCached({
        ...HOME_COLD_EMAIL_DEMO,
        source: 'demo' as const,
        warning: 'Instantly API key is not configured'
      })
    }

    const glance = await loadColdEmailGlanceFromInstantly(apiKey)
    // Align browser cache with the process-local Instantly TTL (60s).
    return portalJsonCached({ ...glance, source: 'instantly' as const }, {}, 60)
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
