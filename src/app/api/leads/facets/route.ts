import { portalJson, portalJsonCached } from '@/lib/portal-http'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { loadLeadFacets } from '@/lib/lead-search'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const admin = getPortalAdminClient()
    const { verticals, cities } = await loadLeadFacets(admin)
    return portalJsonCached({ verticals, cities }, {}, 10)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'facets_failed'
    return portalJson({ error: 'facets_failed', detail: message }, { status: 500 })
  }
}
