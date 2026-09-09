import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { addListMembers, removeListMembers } from '@/lib/lead-lists'

export const dynamic = 'force-dynamic'

const MAX_IDS = 500

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  if (!id) return portalJson({ error: 'id_required' }, { status: 400 })

  let body: { add?: unknown; remove?: unknown }
  try {
    body = (await readBoundedJson(request, 256 * 1024)) as typeof body
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
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data: list, error: listError } = await supabase
      .from('compass_lead_lists')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (listError) {
      return portalJson({ error: 'update_failed', detail: listError.message }, { status: 400 })
    }
    if (!list) return portalJson({ error: 'not_found' }, { status: 404 })

    const added = add.length ? await addListMembers(supabase, id, add) : 0
    const removed = remove.length ? await removeListMembers(supabase, id, remove) : 0
    return portalJson({ ok: true, added, removed })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}
