import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import { CAMPAIGN_BOARD_COLUMNS, type CompassCampaign } from '@/lib/campaigns'
import { tallyLeadsByCampaign } from '@/lib/campaign-wave'
import { assembleOfferDesk, indexInstantlySent, projectOfferSku } from '@/lib/offer-sku'
import { loadSyncSnapshot } from '@/lib/sync-snapshots'
import type { ColdEmailGlance } from '@/lib/home-demo-data'

export const dynamic = 'force-dynamic'

/**
 * GET /api/offers/desk — SKU gallery (live / testing / retired) plus campaign and CRM results.
 */
export async function GET(_request: NextRequest) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [offersRes, campaignRes, leadsRes, instantlySnap] = await Promise.all([
      supabase.from('compass_outbound_offers').select('*').order('sort_order'),
      supabase
        .from('compass_pipeline_campaigns')
        .select(CAMPAIGN_BOARD_COLUMNS)
        .order('name'),
      supabase
        .from('lead_contacts')
        .select('pipeline_campaign_id,outbound_status,opener')
        .not('pipeline_campaign_id', 'is', null)
        .limit(8000),
      loadSyncSnapshot<ColdEmailGlance>(supabase, 'instantly_cold_email').catch(() => null)
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

    return portalJsonCached({
      ...desk,
      instantlySyncedAt: instantlySnap?.syncedAt ?? null
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
