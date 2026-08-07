import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  CLIENT_COMM_MESSAGE_COLUMNS,
  CLIENT_COMM_THREAD_COLUMNS
} from '@/lib/list-columns'
import { nowIso, recordClientActivity } from '@/lib/client-data'
import {
  isCommChannel,
  normalizeParticipants,
  refreshClientCommsSummary
} from '@/lib/client-comms'
import type {
  CompassClientCommMessage,
  CompassClientCommThread,
  CompassClientCommThreadWithMessages
} from '@/lib/types'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

function normalizeThread(row: CompassClientCommThread): CompassClientCommThread {
  return {
    ...row,
    participants: Array.isArray(row.participants) ? row.participants : [],
    channel: row.channel || 'email',
    status: row.status || 'active'
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [clientRes, threadsRes, messagesRes] = await Promise.all([
      supabase
        .from('compass_clients')
        .select('id,name,comms_summary,comms_summary_at,comms_summary_source')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('compass_client_comm_threads')
        .select(CLIENT_COMM_THREAD_COLUMNS)
        .eq('client_id', id)
        .order('last_message_at', { ascending: false, nullsFirst: false }),
      supabase
        .from('compass_client_comm_messages')
        .select(CLIENT_COMM_MESSAGE_COLUMNS)
        .eq('client_id', id)
        .order('occurred_at', { ascending: false })
        .limit(200)
    ])

    if (clientRes.error || threadsRes.error || messagesRes.error) {
      return portalJson({ error: 'fetch_failed' }, { status: 500 })
    }
    if (!clientRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const threads = ((threadsRes.data ?? []) as CompassClientCommThread[]).map(normalizeThread)
    const messages = (messagesRes.data ?? []) as CompassClientCommMessage[]
    const byThread = new Map<string, CompassClientCommMessage[]>()
    for (const message of messages) {
      const list = byThread.get(message.thread_id) ?? []
      if (list.length < 12) list.push(message)
      byThread.set(message.thread_id, list)
    }

    const threadsWithMessages: CompassClientCommThreadWithMessages[] = threads.map((thread) => {
      const threadMessages = byThread.get(thread.id) ?? []
      return {
        ...thread,
        messages: threadMessages,
        message_count: threadMessages.length
      }
    })

    return portalJsonCached({
      clientId: id,
      clientName: clientRes.data.name,
      summary: clientRes.data.comms_summary ?? null,
      summaryAt: clientRes.data.comms_summary_at ?? null,
      summarySource: clientRes.data.comms_summary_source ?? null,
      threads: threadsWithMessages
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  let body: {
    action?: string
    channel?: string
    subject?: string
    participants?: string[] | string
    external_id?: string | null
    notes?: string | null
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    if (body.action === 'summarize') {
      const result = await refreshClientCommsSummary(supabase, id, { refreshAllThreads: true })
      if (!result) return portalJson({ error: 'summarize_failed' }, { status: 400 })
      return portalJson({
        ok: true,
        summary: result.summary,
        source: result.source
      })
    }

    const subject = body.subject?.trim()
    if (!subject) return portalJson({ error: 'subject_required' }, { status: 400 })
    const channel = isCommChannel(body.channel) ? body.channel : 'email'
    const participants = normalizeParticipants(body.participants)
    const externalId = body.external_id?.trim() || null
    const stamp = nowIso()

    const clientCheck = await supabase.from('compass_clients').select('id').eq('id', id).maybeSingle()
    if (clientCheck.error || !clientCheck.data) {
      return portalJson({ error: 'not_found' }, { status: 404 })
    }

    if (externalId) {
      const existing = await supabase
        .from('compass_client_comm_threads')
        .select('id,client_id')
        .eq('external_id', externalId)
        .maybeSingle()
      if (existing.data && existing.data.client_id !== id) {
        return portalJson({ error: 'external_id_in_use' }, { status: 409 })
      }
      if (existing.data && existing.data.client_id === id) {
        return portalJson({ error: 'already_linked', threadId: existing.data.id }, { status: 409 })
      }
    }

    const row = {
      id: `cthread-${crypto.randomUUID()}`,
      client_id: id,
      channel,
      subject: subject.slice(0, 240),
      participants,
      external_id: externalId,
      status: 'active',
      notes: body.notes?.trim() || null,
      summary: null,
      summary_at: null,
      last_message_at: null,
      created_at: stamp,
      updated_at: stamp
    }

    const { data, error } = await supabase
      .from('compass_client_comm_threads')
      .insert(row)
      .select(CLIENT_COMM_THREAD_COLUMNS)
      .single()

    if (error || !data) {
      return portalJson({ error: 'create_failed', detail: error?.message }, { status: 400 })
    }

    await recordClientActivity(supabase, {
      clientId: id,
      action: 'comm_thread_linked',
      body: `Linked ${channel} thread: ${subject.slice(0, 120)}`,
      touch: true
    })

    return portalJson(normalizeThread(data as CompassClientCommThread))
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
