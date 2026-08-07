import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { CLIENT_COMM_MESSAGE_COLUMNS } from '@/lib/list-columns'
import { nowIso, recordClientActivity } from '@/lib/client-data'
import { isCommDirection, refreshClientCommsSummary } from '@/lib/client-comms'
import type { CompassClientCommMessage } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string; threadId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id, threadId } = await context.params

  let body: {
    body?: string
    direction?: string
    sender?: string | null
    occurred_at?: string
    external_id?: string | null
    refresh_summary?: boolean
  }
  try {
    body = (await readBoundedJson(request, 100_000)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const text = body.body?.trim()
  if (!text) return portalJson({ error: 'body_required' }, { status: 400 })

  const direction = isCommDirection(body.direction) ? body.direction : 'inbound'
  const occurredAt = body.occurred_at ? new Date(body.occurred_at) : new Date()
  if (!Number.isFinite(occurredAt.getTime())) {
    return portalJson({ error: 'invalid_occurred_at' }, { status: 400 })
  }
  const stamp = nowIso()
  const occurredIso = occurredAt.toISOString()

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const threadRes = await supabase
      .from('compass_client_comm_threads')
      .select('id,client_id,subject')
      .eq('id', threadId)
      .eq('client_id', id)
      .maybeSingle()

    if (threadRes.error || !threadRes.data) {
      return portalJson({ error: 'not_found' }, { status: 404 })
    }

    const row = {
      id: `cmsg-${crypto.randomUUID()}`,
      thread_id: threadId,
      client_id: id,
      direction,
      sender: body.sender?.trim() || null,
      body: text.slice(0, 20_000),
      occurred_at: occurredIso,
      external_id: body.external_id?.trim() || null,
      created_at: stamp
    }

    const { data, error } = await supabase
      .from('compass_client_comm_messages')
      .insert(row)
      .select(CLIENT_COMM_MESSAGE_COLUMNS)
      .single()

    if (error || !data) {
      return portalJson({ error: 'create_failed', detail: error?.message }, { status: 400 })
    }

    await supabase
      .from('compass_client_comm_threads')
      .update({ last_message_at: occurredIso, updated_at: stamp })
      .eq('id', threadId)

    await recordClientActivity(supabase, {
      clientId: id,
      action: 'comm_message_added',
      body: `${direction} message on ${String(threadRes.data.subject).slice(0, 80)}`,
      touch: true
    })

    let summary: { summary: string; source: string } | null = null
    if (body.refresh_summary !== false) {
      summary = await refreshClientCommsSummary(supabase, id, { threadId })
    }

    return portalJson({
      message: data as CompassClientCommMessage,
      summary: summary?.summary ?? null,
      summarySource: summary?.source ?? null
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
