import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'
import { addListMembers, removeListMembers } from '@/lib/lead-lists'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_IDS = 50

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const authError = requireAgentAuth(request)
  if (authError) return authError
  const { id } = await context.params
  if (!id) return portalJson({ error: 'id_required' }, { status: 400 })

  let body: { add?: unknown; remove?: unknown }
  try {
    body = (await readBoundedJson(request, 64 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const add = Array.isArray(body.add)
    ? body.add.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : []
  const remove = Array.isArray(body.remove)
    ? body.remove.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : []
  if (add.length === 0 && remove.length === 0) {
    return portalJson({ error: 'no_ids' }, { status: 400 })
  }
  if (add.length + remove.length > MAX_IDS) {
    return portalJson({ error: `too_many_ids (max ${MAX_IDS})` }, { status: 413 })
  }

  try {
    const admin = getPortalAdminClient()
    const { data: list, error } = await admin
      .from('compass_lead_lists')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 500 })
    if (!list) return portalJson({ error: 'not_found' }, { status: 404 })
    const added = add.length ? await addListMembers(admin, id, add) : 0
    const removed = remove.length ? await removeListMembers(admin, id, remove) : 0
    return portalJson({ ok: true, listId: id, added, removed })
  } catch (err) {
    console.error('[agent/lists/members]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'update_failed' }, { status: 500 })
  }
}
