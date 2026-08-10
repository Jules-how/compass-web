import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import {
  CAMPAIGN_LIST_COLUMNS,
  emptyCampaignCopyFields,
  projectCampaignCopy,
  type CompassCampaign
} from '@/lib/campaigns'
import {
  InstantlyApiError,
  loadOutboundBoardFromInstantly,
  resolveInstantlyApiKey,
  type OutboundBoard
} from '@/lib/instantly'
import { enrichOutboundBoardFactors } from '@/lib/outbound-factor-performance'
import { demoOutboundBoard } from '@/lib/outbound-live-demo'

export const dynamic = 'force-dynamic'

const EMPTY_BOARD: OutboundBoard = { live: [], history: [], liveCount: 0 }

async function loadPipelineBinds(
  supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase']
): Promise<{ pipeline: CompassCampaign[]; offerNames: Record<string, string> }> {
  const [{ data: campaigns }, { data: offers }] = await Promise.all([
    supabase.from('compass_pipeline_campaigns').select(CAMPAIGN_LIST_COLUMNS),
    supabase
      .from('compass_outbound_offers')
      .select('offer_key,name')
      .eq('archived', false)
  ])

  const pipeline = (campaigns || []).map((row) =>
    projectCampaignCopy({ ...emptyCampaignCopyFields(), ...(row as CompassCampaign) })
  )
  const offerNames = Object.fromEntries(
    (offers || []).map((o: { offer_key: string; name: string }) => [o.offer_key, o.name])
  )
  return { pipeline, offerNames }
}

function withFactors(
  board: OutboundBoard,
  pipeline: CompassCampaign[],
  offerNames: Record<string, string>
): OutboundBoard {
  const enriched = enrichOutboundBoardFactors(board, pipeline, offerNames)
  return {
    ...board,
    live: enriched.live,
    history: enriched.history
  }
}

/**
 * GET /api/instantly/outbound-campaigns — Outbound hub Live + History from Instantly.ai.
 * Enriches rows with pipeline copy binds (offer / CTA / length / audience) when present.
 */
export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    let pipeline: CompassCampaign[] = []
    let offerNames: Record<string, string> = {}
    try {
      ;({ pipeline, offerNames } = await loadPipelineBinds(supabase))
    } catch {
      // Board still works without binds.
    }

    const apiKey = await resolveInstantlyApiKey(supabase)
    if (!apiKey) {
      const board = withFactors(demoOutboundBoard(), pipeline, offerNames)
      return portalJsonCached({
        ...board,
        source: 'demo' as const,
        warning: 'INSTANTLY_API_KEY is not configured'
      })
    }

    const board = withFactors(await loadOutboundBoardFromInstantly(apiKey), pipeline, offerNames)
    return portalJsonCached({ ...board, source: 'instantly' as const }, {}, 60)
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access

    if (err instanceof InstantlyApiError) {
      // Keep 200 so the UI can render an honest empty board (not fake demo cards).
      return portalJson({
        ...EMPTY_BOARD,
        error: 'instantly_unavailable',
        detail: err.message,
        source: 'error' as const,
        warning: err.message
      })
    }

    return portalJson({
      ...EMPTY_BOARD,
      error: 'fetch_failed',
      source: 'error' as const,
      warning: 'fetch_failed'
    })
  }
}
