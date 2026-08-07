import { getPortalAdminClient } from '@/lib/portal-admin'
import { nowIso, recordClientActivity } from '@/lib/client-data'
import { parseCommIngestBody, refreshClientCommsSummary } from '@/lib/client-comms'
import { portalJson, readBoundedJson } from '@/lib/portal-http'
import { CLIENT_COMM_MESSAGE_COLUMNS, CLIENT_COMM_THREAD_COLUMNS } from '@/lib/list-columns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function ingestSecretConfigured(): string | null {
  const dedicated = process.env.COMPASS_COMMS_INGEST_SECRET?.trim()
  if (dedicated) return dedicated
  const shared = process.env.COMPASS_LEAD_INGEST_SECRET?.trim()
  return shared || null
}

function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * Secret-authenticated message ingest for linked client threads.
 * Link a thread in the Clients → Comms tab with an external_id first; then push
 * new email/SMS payloads here (Zapier/Make/n8n/Gmail filter) so context updates
 * within minutes of arrival.
 */
export async function POST(request: Request) {
  const expected = ingestSecretConfigured()
  if (!expected) return portalJson({ error: 'ingest_not_configured' }, { status: 503 })

  const provided = request.headers.get('x-ingest-secret')
  if (!secretsMatch(provided, expected)) {
    return portalJson({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await readBoundedJson(request, 100_000)
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = parseCommIngestBody(body)
  if ('error' in parsed) return portalJson({ error: parsed.error }, { status: 400 })

  const admin = getPortalAdminClient()
  const stamp = nowIso()

  let clientId = parsed.clientId
  if (!clientId && parsed.clientSlug) {
    const slugRes = await admin
      .from('compass_clients')
      .select('id')
      .eq('portal_client_slug', parsed.clientSlug)
      .is('archived_at', null)
      .maybeSingle()
    if (slugRes.error || !slugRes.data) {
      return portalJson({ error: 'unknown_client' }, { status: 404 })
    }
    clientId = slugRes.data.id as string
  }

  const threadRes = await admin
    .from('compass_client_comm_threads')
    .select(CLIENT_COMM_THREAD_COLUMNS)
    .eq('external_id', parsed.threadExternalId)
    .maybeSingle()

  if (threadRes.error) {
    console.error('[ingest/comms] thread lookup failed', threadRes.error.message)
    return portalJson({ error: 'ingest_failed' }, { status: 500 })
  }

  if (!threadRes.data) {
    // Manual link required — do not auto-create threads from ingest.
    return portalJson(
      {
        error: 'thread_not_linked',
        detail:
          'Link this thread on the client Comms tab with matching external_id before ingesting messages.'
      },
      { status: 404 }
    )
  }

  const thread = threadRes.data
  if (clientId && thread.client_id !== clientId) {
    return portalJson({ error: 'client_mismatch' }, { status: 409 })
  }
  clientId = thread.client_id as string

  // Optionally enrich subject/participants/channel if provided and blank-ish.
  const threadPatch: Record<string, unknown> = {
    last_message_at: parsed.message.occurredAt,
    updated_at: stamp
  }
  if (parsed.channel && !thread.channel) threadPatch.channel = parsed.channel
  if (parsed.subject && (!thread.subject || thread.subject === 'Untitled thread')) {
    threadPatch.subject = parsed.subject
  }
  if (parsed.participants.length) {
    const existing = Array.isArray(thread.participants) ? thread.participants : []
    const merged = Array.from(new Set([...existing, ...parsed.participants])).slice(0, 20)
    threadPatch.participants = merged
  }

  const messageId = `cmsg-${crypto.randomUUID()}`
  const messageRow = {
    id: messageId,
    thread_id: thread.id,
    client_id: clientId,
    direction: parsed.message.direction,
    sender: parsed.message.sender ?? null,
    body: parsed.message.body,
    occurred_at: parsed.message.occurredAt,
    external_id: parsed.message.externalId ?? null,
    created_at: stamp
  }

  let messageData: Record<string, unknown> | null = null
  if (parsed.message.externalId) {
    const existingMsg = await admin
      .from('compass_client_comm_messages')
      .select(CLIENT_COMM_MESSAGE_COLUMNS)
      .eq('thread_id', thread.id)
      .eq('external_id', parsed.message.externalId)
      .maybeSingle()

    if (existingMsg.data) {
      const updated = await admin
        .from('compass_client_comm_messages')
        .update({
          direction: messageRow.direction,
          sender: messageRow.sender,
          body: messageRow.body,
          occurred_at: messageRow.occurred_at
        })
        .eq('id', existingMsg.data.id)
        .select(CLIENT_COMM_MESSAGE_COLUMNS)
        .single()
      if (updated.error || !updated.data) {
        console.error('[ingest/comms] message update failed', updated.error?.message)
        return portalJson({ error: 'ingest_failed' }, { status: 500 })
      }
      messageData = updated.data as Record<string, unknown>
    }
  }

  if (!messageData) {
    const inserted = await admin
      .from('compass_client_comm_messages')
      .insert(messageRow)
      .select(CLIENT_COMM_MESSAGE_COLUMNS)
      .single()
    if (inserted.error || !inserted.data) {
      console.error('[ingest/comms] message insert failed', inserted.error?.message)
      return portalJson({ error: 'ingest_failed' }, { status: 500 })
    }
    messageData = inserted.data as Record<string, unknown>
  }

  await admin.from('compass_client_comm_threads').update(threadPatch).eq('id', thread.id)

  await recordClientActivity(admin, {
    clientId,
    action: 'comm_message_ingested',
    body: `${parsed.message.direction} ${thread.channel || 'email'} · ${String(thread.subject).slice(0, 80)}`,
    actor: 'ingest',
    touch: true
  })

  const summary = await refreshClientCommsSummary(admin, clientId, {
    threadId: thread.id as string
  })

  return portalJson({
    ok: true,
    threadId: thread.id,
    clientId,
    messageId: messageData?.id ?? messageId,
    summary: summary?.summary ?? null,
    summarySource: summary?.source ?? null,
    summaryAt: stamp
  })
}
