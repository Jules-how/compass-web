import { requireAgentAuth } from '@/lib/agent-auth'
import { parseSyncSources, runAgentSync } from '@/lib/agent-sync'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * On-demand sync for Cursor agents.
 * Body: { sources?: ['ads','instantly','instantly_leads'], includeBrief?: boolean }
 */
export async function POST(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  let body: unknown = {}
  try {
    if ((request.headers.get('content-length') || '0') !== '0') {
      body = await readBoundedJson(request, 8_192)
    }
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const sources = parseSyncSources(record.sources)
  const includeBrief = record.includeBrief !== false

  try {
    const admin = getPortalAdminClient()
    const result = await runAgentSync(admin, sources, { includeBrief })
    return portalJson(result, { status: result.ok ? 200 : 207 })
  } catch (err) {
    console.error('[agent/sync]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'sync_failed' }, { status: 500 })
  }
}
