import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import {
  COMPONENT_GRAINS,
  COMPONENT_WINDOWS,
  listComponentStats,
  type ComponentGrain,
  type ComponentWindow
} from '@/lib/component-stats'

export const dynamic = 'force-dynamic'

/**
 * GET /api/component-stats?grain=offer&window=30d
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const params = request.nextUrl.searchParams
    const grainParam = params.get('grain')
    const windowParam = params.get('window')

    const grain =
      grainParam && (COMPONENT_GRAINS as readonly string[]).includes(grainParam)
        ? (grainParam as ComponentGrain)
        : undefined
    const window =
      windowParam && (COMPONENT_WINDOWS as readonly string[]).includes(windowParam)
        ? (windowParam as ComponentWindow)
        : undefined

    const rows = await listComponentStats(supabase, { grain, window })
    return portalJsonCached({ rows, grain: grain ?? null, window: window ?? null }, {}, 60)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
