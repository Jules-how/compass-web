import { requireAgentAuth } from '@/lib/agent-auth'
import { summarizeOutboundLibraries } from '@/lib/agent-outbound'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Compact outbound library counts for Cursor agents (token-lean). */
export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  try {
    const admin = getPortalAdminClient()
    const summary = await summarizeOutboundLibraries(admin)
    return portalJson({ ok: true, ...summary })
  } catch (err) {
    console.error('[agent/outbound/summary]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'summary_failed' }, { status: 500 })
  }
}
