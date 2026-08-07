import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import {
  buildDemoTargetingMap,
  buildTargetingMap,
  type TargetingMapLeadRow
} from '@/lib/targeting-map'

export const dynamic = 'force-dynamic'

const PAGE = 1000
const MAX_ROWS = 8000

/**
 * GET /api/leads/targeting-map — aggregate lead city/state × outbound outcomes
 * for the operator targeting success map on Sales overview.
 */
export async function GET(_request: NextRequest) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const rows: TargetingMapLeadRow[] = []

    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const to = Math.min(from + PAGE - 1, MAX_ROWS - 1)
      const { data, error } = await supabase
        .from('lead_contacts')
        .select('city,state,outbound_status')
        .order('mirrored_at', { ascending: false })
        .range(from, to)

      if (error) {
        // Table missing / schema drift — keep Sales overview usable with demo map.
        return portalJsonCached({
          ...buildDemoTargetingMap(),
          warning: 'lead_contacts_unavailable'
        })
      }

      const batch = (data ?? []) as TargetingMapLeadRow[]
      rows.push(...batch)
      if (batch.length < PAGE) break
    }

    if (rows.length === 0) {
      return portalJsonCached({
        ...buildDemoTargetingMap(),
        warning: 'no_leads'
      })
    }

    const model = buildTargetingMap(rows, { source: 'live', limit: 30 })
    return portalJsonCached(model)
  } catch (err) {
    return (
      portalAccessResponse(err) ??
      portalJson({ error: 'fetch_failed' }, { status: 500 })
    )
  }
}
