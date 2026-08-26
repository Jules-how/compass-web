import { requireAgentAuth } from '@/lib/agent-auth'
import { runInstantlyBackfill, resetInstantlyBackfillCursor } from '@/lib/instantly-backfill'
import { resolveInstantlyApiKey } from '@/lib/instantly'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/agent/instantly/backfill
 * Body: { dryRun?: boolean, reset?: boolean, maxCampaigns?: number }
 * Read-only against Instantly. Writes compass_evidence_events only.
 */
export async function POST(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  let body: { dryRun?: boolean; reset?: boolean; maxCampaigns?: number } = {}
  try {
    if ((request.headers.get('content-length') || '0') !== '0') {
      body = (await readBoundedJson(request, 8_192)) as typeof body
    }
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    const admin = getPortalAdminClient()
    const apiKey = await resolveInstantlyApiKey(admin)
    if (!apiKey) {
      return portalJson({ error: 'INSTANTLY_API_KEY is not configured' }, { status: 503 })
    }

    if (body.reset) {
      await resetInstantlyBackfillCursor(admin)
    }

    const result = await runInstantlyBackfill(admin, apiKey, {
      dryRun: body.dryRun === true,
      reset: body.reset === true,
      maxCampaigns: typeof body.maxCampaigns === 'number' ? body.maxCampaigns : undefined
    })

    return portalJson({ ok: true, ...result })
  } catch (err) {
    console.error('[agent/instantly/backfill]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'backfill_failed' }, { status: 500 })
  }
}
