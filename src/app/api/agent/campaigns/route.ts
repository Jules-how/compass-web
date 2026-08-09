import { requireAgentAuth } from '@/lib/agent-auth'
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
        .select('id,name,status,health,priority,summary,instantly_campaign_id,start_date,end_date,updated_at')
        .order('priority', { ascending: false })
        .limit(40),
      loadSyncSnapshot<ColdEmailGlance>(admin, 'instantly_cold_email')
    ])

    if (pipeline.error) {
      return portalJson({ error: 'fetch_failed', detail: pipeline.error.message }, { status: 500 })
    }

    return portalJson({
      ok: true,
      pipeline: (pipeline.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        health: row.health,
        priority: row.priority,
        summary: row.summary,
        instantlyCampaignId: row.instantly_campaign_id,
        startDate: row.start_date,
        endDate: row.end_date,
        updatedAt: row.updated_at
      })),
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
