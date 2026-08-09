import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import {
  getInstantlyApiKey,
  InstantlyApiError,
  loadOutboundBoardFromInstantly
} from '@/lib/instantly'
import { demoOutboundBoard } from '@/lib/outbound-live-demo'

export const dynamic = 'force-dynamic'

/**
 * GET /api/instantly/outbound-campaigns — Outbound hub Live + History from Instantly.ai.
 * Requires operator portal access. Returns live metrics when INSTANTLY_API_KEY
 * is set; otherwise falls back to demo data with `source: "demo"`.
 */
export async function GET() {
  try {
    await requirePortalAccess({ operator: true })

    const apiKey = getInstantlyApiKey()
    if (!apiKey) {
      const board = demoOutboundBoard()
      return portalJsonCached({
        ...board,
        source: 'demo' as const,
        warning: 'INSTANTLY_API_KEY is not configured'
      })
    }

    const board = await loadOutboundBoardFromInstantly(apiKey)
    return portalJsonCached({ ...board, source: 'instantly' as const }, {}, 60)
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
