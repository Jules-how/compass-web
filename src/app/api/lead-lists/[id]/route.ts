import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  if (!id) return portalJson({ error: 'id_required' }, { status: 400 })

  let body: { name?: string; notes?: string | null }
  try {
    body = (await readBoundedJson(request, 16 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
    patch.name = name.slice(0, 120)
  }
  if (body.notes !== undefined) {
    patch.notes =
      typeof body.notes === 'string' && body.notes.trim()
        ? body.notes.trim().slice(0, 2000)
        : null
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_lead_lists')
      .update(patch)
      .eq('id', id)
      .select('id,name,notes,created_at,updated_at')
      .maybeSingle()
    if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({ list: data })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  if (!id) return portalJson({ error: 'id_required' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { count, error: countError } = await supabase
      .from('compass_lead_list_members')
      .select('lead_id', { count: 'exact', head: true })
      .eq('list_id', id)
    if (countError) {
      return portalJson({ error: 'delete_failed', detail: countError.message }, { status: 400 })
    }
    if ((count ?? 0) > 0) {
      return portalJson({ error: 'list_not_empty', members: count }, { status: 409 })
    }
    const { error } = await supabase.from('compass_lead_lists').delete().eq('id', id)
    if (error) return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })
    return portalJson({ ok: true, id })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
