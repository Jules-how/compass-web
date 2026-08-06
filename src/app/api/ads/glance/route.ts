import { loadHomeGlance } from '@/lib/ad-sync'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJsonCached, portalJson } from '@/lib/portal-http'
import { HOME_AD_DEMO } from '@/lib/home-demo-data'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    try {
      const result = await loadHomeGlance(supabase)
      return portalJsonCached({
        ...result.glance,
        source: result.source,
        syncedAt: result.syncedAt,
        connectedAccounts: result.connectedAccounts
      })
    } catch (err) {
      // Migration not applied yet — fall back to demo payload.
      const message = err instanceof Error ? err.message : ''
      if (/does not exist|schema cache/i.test(message)) {
        return portalJsonCached({
          ...HOME_AD_DEMO,
          source: 'demo' as const,
          syncedAt: null,
          connectedAccounts: 0,
          migrationRequired: true
        })
      }
      throw err
    }
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
