import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, readBoundedJson, requireSameOrigin } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET /api/tasks/[id]/notes — immutable note entries for a task, oldest first.
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_task_note_revisions')
      .select('*')
      .eq('task_id', id)
      .order('created_at', { ascending: true })
    if (error) return portalJson({ error: 'fetch_failed' }, { status: 400 })
    return portalJson(data ?? [])
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

// POST /api/tasks/[id]/notes — record a new note revision.
export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  let payload: unknown
  try {
    payload = await readBoundedJson(request)
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return portalJson({ error: 'body_required' }, { status: 400 })
  }
  const body = payload as { body?: unknown }
  if (typeof body.body !== 'string' || !body.body.trim()) {
    return portalJson({ error: 'body_required' }, { status: 400 })
  }

  const noteBody = body.body.trim()

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase.rpc('portal_operator_append_task_note', {
      p_task_id: id,
      p_body: noteBody
    })
    if (error) {
      return portalJson(
        { error: error.code === 'P0002' ? 'not_found' : 'create_failed' },
        { status: error.code === 'P0002' ? 404 : 400 }
      )
    }

    return portalJson(data, { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
