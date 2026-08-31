import { requireAgentAuth } from '@/lib/agent-auth'
import { markLeadContacts, MARK_BODY_MAX_BYTES } from '@/lib/lead-mark'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Alias: bulk campaign/cohort/status, or per-row facts/opener/Instantly land.
 * Prefer POST /api/agent/leads for new harvest writes.
 */
export async function PATCH(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  let body: Parameters<typeof markLeadContacts>[1]
  try {
    body = (await readBoundedJson(request, MARK_BODY_MAX_BYTES)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    const admin = getPortalAdminClient()
    return await markLeadContacts(admin, body)
  } catch (err) {
    console.error('[agent/leads/mark]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'update_failed' }, { status: 500 })
  }
}
