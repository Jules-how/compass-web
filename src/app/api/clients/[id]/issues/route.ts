import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { CLIENT_ISSUE_COLUMNS } from '@/lib/list-columns'
import { nowIso, recordClientActivity } from '@/lib/client-data'
import { CLIENT_ISSUE_STATUSES, type ClientIssueStatus } from '@/lib/client-pm'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

function normalizeIssueStatus(value: string | null | undefined): ClientIssueStatus {
  if (value && (CLIENT_ISSUE_STATUSES as readonly string[]).includes(value)) {
    return value as ClientIssueStatus
  }
  return 'not-started'
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId } = await context.params

  let body: {
    title?: string
    status?: string
    priority?: number
    due?: string | null
    notes?: string | null
    project_id?: string | null
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const title = body.title?.trim()
  if (!title) return portalJson({ error: 'title_required' }, { status: 400 })

  const stamp = nowIso()
  const row = {
    id: `cissue-${crypto.randomUUID()}`,
    client_id: clientId,
    title,
    status: normalizeIssueStatus(body.status),
    priority: typeof body.priority === 'number' ? body.priority : 0,
    due: body.due || null,
    notes: body.notes?.trim() || null,
    project_id: body.project_id || null,
    sort_order: 0,
    created_at: stamp,
    updated_at: stamp,
    mirrored_at: stamp
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const clientCheck = await supabase.from('compass_clients').select('id').eq('id', clientId).maybeSingle()
    if (clientCheck.error) {
      return portalJson({ error: 'create_failed', detail: clientCheck.error.message }, { status: 400 })
    }
    if (!clientCheck.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const { data, error } = await supabase
      .from('compass_client_issues')
      .insert(row)
      .select(CLIENT_ISSUE_COLUMNS)
      .single()
    if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })

    await recordClientActivity(supabase, {
      clientId,
      action: 'issue_created',
      body: `Created issue: ${title}`
    })

    return portalJson(data, { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId } = await context.params

  let body: {
    id?: string
    title?: string
    status?: string
    priority?: number
    due?: string | null
    notes?: string | null
    project_id?: string | null
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const issueId = body.id?.trim()
  if (!issueId) return portalJson({ error: 'id_required' }, { status: 400 })

  const stamp = nowIso()
  const patch: Record<string, unknown> = {
    updated_at: stamp,
    mirrored_at: stamp
  }
  if (typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title) return portalJson({ error: 'title_required' }, { status: 400 })
    patch.title = title
  }
  if (typeof body.status === 'string') patch.status = normalizeIssueStatus(body.status)
  if (typeof body.priority === 'number') patch.priority = body.priority
  if (Object.prototype.hasOwnProperty.call(body, 'due')) patch.due = body.due || null
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) patch.notes = body.notes?.trim() || null
  if (Object.prototype.hasOwnProperty.call(body, 'project_id')) {
    patch.project_id = body.project_id || null
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_client_issues')
      .update(patch)
      .eq('id', issueId)
      .eq('client_id', clientId)
      .select(CLIENT_ISSUE_COLUMNS)
      .maybeSingle()
    if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })

    await recordClientActivity(supabase, {
      clientId,
      action: 'issue_updated',
      body: `Updated issue: ${data.title}`
    })

    return portalJson(data)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId } = await context.params

  let body: { id?: string }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }
  const issueId = body.id?.trim()
  if (!issueId) return portalJson({ error: 'id_required' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const existing = await supabase
      .from('compass_client_issues')
      .select(CLIENT_ISSUE_COLUMNS)
      .eq('id', issueId)
      .eq('client_id', clientId)
      .maybeSingle()
    if (existing.error) {
      return portalJson({ error: 'delete_failed', detail: existing.error.message }, { status: 400 })
    }
    if (!existing.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const { error } = await supabase
      .from('compass_client_issues')
      .delete()
      .eq('id', issueId)
      .eq('client_id', clientId)
    if (error) return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })

    await recordClientActivity(supabase, {
      clientId,
      action: 'issue_deleted',
      body: `Deleted issue: ${existing.data.title}`
    })

    return portalJson({ ok: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
