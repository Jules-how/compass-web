import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { nowIso, recordClientActivity } from '@/lib/client-data'
import { refreshClientCommsSummary } from '@/lib/client-comms'

import type { VoiceCallRow } from '@/lib/types'

export async function upsertVoiceCall(
  supabase: SupabaseClient,
  row: Omit<VoiceCallRow, 'created_at'> & { created_at?: string }
): Promise<VoiceCallRow> {
  const stamp = row.created_at ?? nowIso()
  const { data, error } = await supabase
    .from('compass_voice_calls')
    .upsert({ ...row, created_at: stamp }, { onConflict: 'retell_call_id' })
    .select('*')
    .single()
  if (error || !data) throw new Error(error?.message || 'voice_call_upsert_failed')
  return data as VoiceCallRow
}

export async function writeCallCommThread(
  supabase: SupabaseClient,
  input: {
    clientId: string
    callId: string
    fromNumber: string | null
    body: string
    occurredAt: string
  }
): Promise<void> {
  const stamp = nowIso()
  const threadExternalId = `retell-call-${input.callId}`
  const threadId = `cthr-${input.clientId}-call`

  const existing = await supabase
    .from('compass_client_comm_threads')
    .select('id')
    .eq('client_id', input.clientId)
    .eq('external_id', threadExternalId)
    .maybeSingle()

  let resolvedThreadId = existing.data?.id as string | undefined
  if (!resolvedThreadId) {
    const insert = await supabase
      .from('compass_client_comm_threads')
      .insert({
        id: threadId,
        client_id: input.clientId,
        channel: 'call',
        subject: `Call ${input.callId.slice(0, 8)}`,
        participants: input.fromNumber ? [input.fromNumber] : [],
        external_id: threadExternalId,
        status: 'active',
        last_message_at: input.occurredAt,
        created_at: stamp,
        updated_at: stamp
      })
      .select('id')
      .single()
    resolvedThreadId = (insert.data?.id as string) ?? threadId
  } else {
    await supabase
      .from('compass_client_comm_threads')
      .update({ last_message_at: input.occurredAt, updated_at: stamp })
      .eq('id', resolvedThreadId)
  }

  await supabase.from('compass_client_comm_messages').insert({
    id: `cmsg-${crypto.randomUUID()}`,
    thread_id: resolvedThreadId,
    client_id: input.clientId,
    direction: 'inbound',
    sender: input.fromNumber,
    body: input.body.slice(0, 20_000),
    occurred_at: input.occurredAt,
    external_id: input.callId,
    created_at: stamp
  })

  await recordClientActivity(supabase, {
    clientId: input.clientId,
    action: 'voice_call_logged',
    body: input.body.slice(0, 200),
    actor: 'voice',
    touch: true
  })

  await refreshClientCommsSummary(supabase, input.clientId, { threadId: resolvedThreadId })
}

export async function listRecentVoiceCalls(
  supabase: SupabaseClient,
  clientId: string,
  limit = 10
): Promise<VoiceCallRow[]> {
  const { data, error } = await supabase
    .from('compass_voice_calls')
    .select('*')
    .eq('client_id', clientId)
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as VoiceCallRow[]
}
