import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import { listCrmLists } from '@/lib/lead-lists'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  try {
    const admin = getPortalAdminClient()
    const lists = await listCrmLists(admin)
    return portalJson({
      ok: true,
      lists: lists.map((row) => ({
        id: row.id,
        name: row.name,
        notes: row.notes,
        memberCount: row.member_count ?? 0,
        updatedAt: row.updated_at
      }))
    })
  } catch (err) {
    console.error('[agent/lists]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'list_failed' }, { status: 500 })
  }
}
