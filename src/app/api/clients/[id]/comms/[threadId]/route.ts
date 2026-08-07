import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { CLIENT_COMM_THREAD_COLUMNS } from '@/lib/list-columns'
import { nowIso, recordClientActivity } from '@/lib/client-data'
import { isCommChannel, normalizeParticipants } from '@/lib/client-comms'
import type { CompassClientCommThread } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string; threadId: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id, threadId } = await context.params

  let body: {
    subject?: string
    channel?: string
    participants?: string[] | string
    external_id?: string | null
    notes?: string | null
    status?: string
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const stamp = nowIso()
  const patch: Record<string, unknown> = { updated_at: stamp }

  if (typeof body.subject === 'string') {
    const subject = body.subject.trim()
    if (!subject) return portalJson({ error: 'subject_required' }, { status: 400 })
    patch.subject = subject.slice(0, 240)
  }
  if (isCommChannel(body.channel)) patch.channel = body.channel
  if (Object.prototype.hasOwnProperty.call(body, 'participants')) {
    patch.participants = normalizeParticipants(body.participants)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'external_id')) {
    patch.external_id = body.external_id?.trim() || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    patch.notes = body.notes?.trim() || null
  }
  if (body.status === 'active' || body.status === 'archived') {
    patch.status = body.status
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_client_comm_threads')
      .update(patch)
      .eq('id', threadId)
      .eq('client_id', id)
      .select(CLIENT_COMM_THREAD_COLUMNS)
      .maybeSingle()

    if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })

    return portalJson({
      ...(data as CompassClientCommThread),
      participants: Array.isArray((data as CompassClientCommThread).participants)
        ? (data as CompassClientCommThread).participants
        : []
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id, threadId } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const existing = await supabase
      .from('compass_client_comm_threads')
      .select('id,subject,channel')
      .eq('id', threadId)
      .eq('client_id', id)
      .maybeSingle()

    if (existing.error) {
      return portalJson({ error: 'delete_failed', detail: existing.error.message }, { status: 400 })
    }
    if (!existing.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const { error } = await supabase
      .from('compass_client_comm_threads')
      .delete()
      .eq('id', threadId)
      .eq('client_id', id)

    if (error) return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })

    await recordClientActivity(supabase, {
      clientId: id,
      action: 'comm_thread_unlinked',
      body: `Unlinked ${existing.data.channel} thread: ${String(existing.data.subject).slice(0, 120)}`,
      touch: false
    })

    return portalJson({ ok: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
