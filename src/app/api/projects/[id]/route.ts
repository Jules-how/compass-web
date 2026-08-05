import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, readBoundedJson, requireSameOrigin } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  let body: {
    name?: string
    status?: string
    business_function_id?: string | null
    notes?: string | null
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    mirrored_at: new Date().toISOString()
  }
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
    patch.name = name
  }
  if (typeof body.status === 'string') patch.status = body.status.trim() || 'active'
  if (Object.prototype.hasOwnProperty.call(body, 'business_function_id')) {
    patch.business_function_id = body.business_function_id ?? null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    patch.notes = body.notes ?? null
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_projects')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson(data)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_projects')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({ ok: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
