import { requireAgentAuth } from '@/lib/agent-auth'
import { buildAgentBrief } from '@/lib/agent-brief'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import { loadSyncSnapshot } from '@/lib/sync-snapshots'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Compact operator brief for Cursor agents (local + cloud).
 * Prefer this over listing full tables — keep prompts token-lean.
 */
export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  try {
    const admin = getPortalAdminClient()
    const fresh = request.headers.get('x-compass-fresh') === '1'
    if (!fresh) {
      const cached = await loadSyncSnapshot(admin, 'daily_brief')
      if (cached?.payload && typeof cached.payload === 'object' && (cached.payload as {schemaVersion?:number}).schemaVersion === 2 && Date.now() - Date.parse(cached.syncedAt) < 30 * 60 * 1000) {
        return portalJson({
          ok: true,
          cached: true,
          pathfinder: { context: "/api/agent/pathfinder", review: "/api/agent/pathfinder", instruction: "Read approved outcomes, existing work and persistent findings before choosing daily actions. Preserve goal targets." },
          syncedAt: cached.syncedAt,
          brief: cached.payload
        })
      }
    }

    const brief = await buildAgentBrief(admin)
    return portalJson({ ok: true, cached: false, brief, pathfinder: { context: "/api/agent/pathfinder", review: "/api/agent/pathfinder", instruction: "Read approved outcomes, existing work and persistent findings before choosing daily actions. Preserve goal targets." } })
  } catch (err) {
    console.error('[agent/brief]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'brief_failed' }, { status: 500 })
  }
}
