import type { NextRequest } from 'next/server'
import type { CompassTaskUpdate } from '@/lib/types'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, readBoundedJson, requireSameOrigin } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

const ALLOWED_FIELDS = [
  'title',
  'status',
  'priority',
  'due',
  'source',
  'project_id',
  'parent_task_id',
  'business_function_id',
  'task_type',
  'complexity',
  'notes'
] as const

// GET /api/tasks/[id] — single task.
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_tasks')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) return portalJson({ error: 'fetch_failed' }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson(data)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

// PATCH /api/tasks/[id] — update via the Sync v2 mutation RPC.
export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  let body: CompassTaskUpdate & { expected_updated_at?: string }
  try {
    body = (await readBoundedJson(request)) as CompassTaskUpdate
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const patch = Object.fromEntries(
    ALLOWED_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(body, field)).map(
      (field) => [field, body[field]]
    )
  )

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = body.expected_updated_at
      ? await supabase.rpc('pathfinder_apply_task', { p_task_id: id, p_patch: patch, p_expected_updated_at: body.expected_updated_at })
      : await supabase.rpc('portal_operator_apply_task_mutation', { p_task_id: id, p_patch: patch, p_base_entity_version: null })
    if (error) {
      const message = error.message ?? ''
      if (/resource not found/i.test(message)) return portalJson({ error: 'not_found' }, { status: 404 })
      return portalJson({ error: 'update_failed', detail: message }, { status: 400 })
    }
    const result = data as { status?: string; task?: unknown; error?: string } | null
    if (!result || result.status === 'conflict') {
      return portalJson(
        { error: 'version_conflict', detail: result?.error ?? 'conflict', task: result?.task ?? null },
        { status: 409 }
      )
    }
    if (!result.task) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson(result.task)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

// DELETE /api/tasks/[id] — tombstone via the Sync v2 mutation RPC.
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(_request)
  if (originError) return originError
  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase.rpc('portal_operator_delete_task_mutation', {
      p_task_id: id
    })
    if (error) {
      const message = error.message ?? ''
      if (/resource not found/i.test(message)) return portalJson({ error: 'not_found' }, { status: 404 })
      return portalJson({ error: 'delete_failed', detail: message }, { status: 400 })
    }
    const result = data as { ok?: boolean } | null
    if (!result?.ok) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({ ok: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
