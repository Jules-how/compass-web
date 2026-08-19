import { requireAgentAuth } from '@/lib/agent-auth'
import {
  buildWaveSnapshot,
  compactWaveForAgent,
  emptyWaveLeadSummary,
  summarizeLeadsByCampaign
} from '@/lib/campaign-wave'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import { loadSyncSnapshot } from '@/lib/sync-snapshots'
import type { ColdEmailGlance } from '@/lib/home-demo-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Pipeline campaigns + cached Instantly campaign glance for agents.
 */
export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  try {
    const admin = getPortalAdminClient()
    const [pipeline, instantlySnap] = await Promise.all([
      admin
        .from('compass_pipeline_campaigns')
        .select(
          'id,name,status,health,priority,summary,instantly_campaign_id,offer_key,copy_status,opener_reviewed_at,copy_confirmed_at,start_date,end_date,go_live_at,updated_at'
        )
        .order('priority', { ascending: false })
        .limit(40),
      loadSyncSnapshot<ColdEmailGlance>(admin, 'instantly_cold_email')
    ])

    if (pipeline.error) {
      return portalJson({ error: 'fetch_failed', detail: pipeline.error.message }, { status: 500 })
    }

    const rows = pipeline.data ?? []
    const ids = rows.map((row) => row.id)
    let leadSummaries: ReturnType<typeof summarizeLeadsByCampaign> = {}
    if (ids.length > 0) {
      const leadsRes = await admin
        .from('lead_contacts')
        .select('pipeline_campaign_id,outbound_status,opener,enrich_status,email,company,opener_track,opener_kind,icp_status')
        .in('pipeline_campaign_id', ids)
        .limit(8000)
      if (!leadsRes.error) {
        leadSummaries = summarizeLeadsByCampaign(leadsRes.data ?? [])
      }
    }

    return portalJson({
      ok: true,
      pipeline: rows.map((row) => {
        const snapshot = buildWaveSnapshot({
          campaign: {
            offer_key: row.offer_key,
            copy_status: row.copy_status,
            instantly_campaign_id: row.instantly_campaign_id,
            opener_reviewed_at: row.opener_reviewed_at,
            copy_confirmed_at: row.copy_confirmed_at
          },
          leads: leadSummaries[row.id] ?? emptyWaveLeadSummary(),
          instantly: null,
          includeCopyMatch: true
        })
        return {
          id: row.id,
          name: row.name,
          status: row.status,
          health: row.health,
          priority: row.priority,
          summary: row.summary,
          instantlyCampaignId: row.instantly_campaign_id,
          startDate: row.start_date,
          endDate: row.end_date,
          goLiveAt: row.go_live_at,
          updatedAt: row.updated_at,
          wave: compactWaveForAgent(snapshot)
        }
      }),
      instantly: {
        syncedAt: instantlySnap?.syncedAt ?? null,
        campaigns: instantlySnap?.payload?.campaigns ?? [],
        emailsSentToday: instantlySnap?.payload?.emailsSentToday ?? 0,
        repliesWaiting: instantlySnap?.payload?.repliesWaiting ?? 0,
        replyRate: instantlySnap?.payload?.replyRate ?? 0
      }
    })
  } catch (err) {
    console.error('[agent/campaigns]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
