import { requireAgentAuth } from '@/lib/agent-auth'
import { CAMPAIGN_BOARD_COLUMNS, type CompassCampaign } from '@/lib/campaigns'
import { tallyLeadsByCampaign } from '@/lib/campaign-wave'
import type { ColdEmailGlance } from '@/lib/home-demo-data'
import { assembleOfferDesk, indexInstantlySent, projectOfferSku } from '@/lib/offer-sku'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import { loadSyncSnapshot } from '@/lib/sync-snapshots'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/agent/offers/desk — SKU lock + outbound results. Not the markdown offer file.
 */
export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  try {
    const admin = getPortalAdminClient()
    const [offersRes, campaignRes, leadsRes, instantlySnap] = await Promise.all([
      admin.from('compass_outbound_offers').select('*').order('sort_order'),
      admin.from('compass_pipeline_campaigns').select(CAMPAIGN_BOARD_COLUMNS).order('name'),
      admin
        .from('lead_contacts')
        .select('pipeline_campaign_id,outbound_status,opener')
        .not('pipeline_campaign_id', 'is', null)
        .limit(8000),
      loadSyncSnapshot<ColdEmailGlance>(admin, 'instantly_cold_email').catch(() => null)
    ])

    if (offersRes.error) {
      return portalJson({ error: 'fetch_failed', detail: offersRes.error.message }, { status: 500 })
    }
    if (campaignRes.error) {
      return portalJson({ error: 'fetch_failed', detail: campaignRes.error.message }, { status: 500 })
    }

    const offers = (offersRes.data ?? []).map((row) => projectOfferSku(row as Record<string, unknown>))
    const campaigns = (campaignRes.data ?? []) as CompassCampaign[]
    const tallies = leadsRes.error ? {} : tallyLeadsByCampaign(leadsRes.data ?? [])
    const desk = assembleOfferDesk({
      offers,
      campaigns,
      tallies,
      instantlyById: indexInstantlySent(instantlySnap?.payload?.campaigns)
    })

    return portalJson({
      ok: true,
      ...desk,
      instantlySyncedAt: instantlySnap?.syncedAt ?? null
    })
  } catch (err) {
    console.error('[agent/offers/desk]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
