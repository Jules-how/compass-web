import { requireCronAuth } from '@/lib/agent-auth'
import { ALL_AGENT_SYNC_SOURCES, runAgentSync } from '@/lib/agent-sync'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Vercel Cron entrypoint — daily ads + Instantly glance + Instantly→CRM lead sync.
 * Auth: Authorization: Bearer <CRON_SECRET|COMPASS_AGENT_SECRET>
 */
export async function GET(request: Request) {
  return runDaily(request)
}

export async function POST(request: Request) {
  return runDaily(request)
}

async function runDaily(request: Request) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = getPortalAdminClient()
    const result = await runAgentSync(admin, ALL_AGENT_SYNC_SOURCES, { includeBrief: true })
    return portalJson(
      {
        ok: result.ok,
        ranAt: result.ranAt,
        ads: result.ads
          ? {
              accounts: result.ads.accounts,
              synced: result.ads.synced,
              failed: result.ads.failed
            }
          : undefined,
        instantly: result.instantly,
        instantlyLeads: result.instantlyLeads
          ? {
              fetched: result.instantlyLeads.fetched,
              upserted: result.instantlyLeads.upserted,
              inserted: result.instantlyLeads.inserted,
              updated: result.instantlyLeads.updated,
              error: result.instantlyLeads.error
            }
          : undefined,
        hint: result.brief?.hint
      },
      { status: result.ok ? 200 : 207 }
    )
  } catch (err) {
    console.error('[cron/daily-sync]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'sync_failed' }, { status: 500 })
  }
}
