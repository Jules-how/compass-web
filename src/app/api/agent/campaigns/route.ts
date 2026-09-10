import { requireAgentAuth } from '@/lib/agent-auth'
import {
  buildWaveSnapshot,
  compactWaveForAgent,
  emptyWaveLeadSummary,
  summarizeLeadsByCampaign
} from '@/lib/campaign-wave'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'
import { reconcileProviderCampaign } from '@/lib/campaign-reconcile'
import { loadCohortLeadRowsForCampaigns } from '@/lib/lead-lists'
import { loadSyncSnapshot } from '@/lib/sync-snapshots'
import type { ColdEmailGlance } from '@/lib/home-demo-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const denied=requireAgentAuth(request)
  if(denied) return denied
  try {
    return portalJson(await reconcileProviderCampaign(getPortalAdminClient(),await readBoundedJson(request,16000)))
  } catch(error) {
    const message=error instanceof Error?error.message:'reconcile_failed'
    return portalJson({error:message},{status:/conflict/.test(message)?409:400})
  }
}

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
    const evidence = await admin.from('compass_operating_records').select('id,kind,data,updated_at').in('kind',['campaign','preparation']).limit(500)
    if(evidence.error) throw new Error('Campaign evidence unavailable')
    const ids = rows.map((row) => row.id)
    let leadSummaries: ReturnType<typeof summarizeLeadsByCampaign> = {}
    const listIdsByCampaign = new Map<string, string[]>()
    if (ids.length > 0) {
      const [byCampaign, attachments] = await Promise.all([
        loadCohortLeadRowsForCampaigns<{
          id?: string | null
          outbound_status?: string | null
          opener?: string | null
          enrich_status?: string | null
          email?: string | null
          company?: string | null
          pipeline_campaign_id?: string | null
        }>(admin, ids, 'id,outbound_status,opener,enrich_status,email,company,pipeline_campaign_id,opener_track,opener_kind,icp_status'),
        admin.from('compass_campaign_lists').select('campaign_id,list_id').in('campaign_id', ids)
      ])
      if (!attachments.error) {
        for (const row of attachments.data ?? []) {
          const campaignId = String(row.campaign_id || '')
          const listId = String(row.list_id || '')
          if (!campaignId || !listId) continue
          const bucket = listIdsByCampaign.get(campaignId) ?? []
          bucket.push(listId)
          listIdsByCampaign.set(campaignId, bucket)
        }
      }
      const leadRows = Object.entries(byCampaign).flatMap(([campaignId, leads]) =>
        leads.map((lead) => ({ ...lead, pipeline_campaign_id: campaignId }))
      )
      leadSummaries = summarizeLeadsByCampaign(leadRows)
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
          planningStatus: row.status,
          provider: evidence.data?.find(r=>r.id===`campaign:${row.id}`)?.data ?? null,
          preparations: evidence.data?.filter(r=>r.kind==='preparation' && r.data.campaign_id===row.id).map(r=>({id:r.id,status:r.data.status,count:r.data.lead_ids?.length??null,source:r.data.source,url:r.data.url})) ?? [],
          health: row.health,
          priority: row.priority,
          summary: row.summary,
          instantlyCampaignId: row.instantly_campaign_id,
          startDate: row.start_date,
          endDate: row.end_date,
          goLiveAt: row.go_live_at,
          updatedAt: row.updated_at,
          listIds: listIdsByCampaign.get(row.id) ?? [],
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
