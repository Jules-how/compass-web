import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isAiGatewayLikelyConfigured } from '@/lib/brain-dump-ai'
import { nowIso } from '@/lib/client-data'
import type {
  CompassClientCommMessage,
  CompassClientCommThread,
  CommChannel,
  CommDirection,
  CommSummarySource
} from '@/lib/types'

export const COMM_CHANNELS = ['email', 'sms', 'call', 'other'] as const
export const COMM_DIRECTIONS = ['inbound', 'outbound'] as const

const MAX_MESSAGES_FOR_SUMMARY = 40
const MAX_BODY_CHARS = 1_200
const MAX_SUMMARY_CHARS = 600

const summarySchema = z.object({
  summary: z.string().min(1).max(MAX_SUMMARY_CHARS),
  openLoops: z.array(z.string().max(160)).max(6),
  sentiment: z.enum(['positive', 'neutral', 'concerned', 'urgent']).optional()
})

const SYSTEM = `You summarize recent client communications for a Switchflow Compass operator.
Rules:
- One tight paragraph (or 3-5 short bullets) covering what changed recently.
- Call out open loops, decisions needed, and commitments.
- Prefer facts from the messages; do not invent.
- Mention channel mix when useful (email vs SMS).
- Keep under ${MAX_SUMMARY_CHARS} characters.
- If nothing substantive, say so briefly.`

function defaultModel(): string {
  return (process.env.COMPASS_AI_MODEL || 'openai/gpt-5.4-nano').trim()
}

export function isCommChannel(value: unknown): value is CommChannel {
  return typeof value === 'string' && (COMM_CHANNELS as readonly string[]).includes(value)
}

export function isCommDirection(value: unknown): value is CommDirection {
  return typeof value === 'string' && (COMM_DIRECTIONS as readonly string[]).includes(value)
}

export function normalizeParticipants(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20)
  }
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 20)
}

export function commChannelLabel(channel: string | null | undefined): string {
  switch (channel) {
    case 'email':
      return 'Email'
    case 'sms':
      return 'SMS'
    case 'call':
      return 'Call'
    case 'other':
      return 'Other'
    default:
      return channel || '—'
  }
}

function clampBody(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length <= MAX_BODY_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_BODY_CHARS)}…`
}

function formatMessageLine(message: CompassClientCommMessage, thread?: CompassClientCommThread): string {
  const when = message.occurred_at
  const dir = message.direction === 'outbound' ? 'out' : 'in'
  const channel = thread?.channel ?? 'email'
  const subject = thread?.subject ? ` [${thread.subject}]` : ''
  const sender = message.sender?.trim() || (dir === 'out' ? 'us' : 'them')
  return `${when} ${channel}/${dir} ${sender}${subject}: ${clampBody(message.body)}`
}

export function buildHeuristicCommsSummary(
  messages: CompassClientCommMessage[],
  threads: CompassClientCommThread[]
): string {
  if (messages.length === 0) {
    return 'No linked communications yet. Link an email or SMS thread to start gathering context.'
  }

  const byId = new Map(threads.map((thread) => [thread.id, thread]))
  const recent = [...messages]
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, 8)

  const channels = new Set(recent.map((msg) => byId.get(msg.thread_id)?.channel || 'email'))
  const inbound = recent.filter((msg) => msg.direction === 'inbound').length
  const outbound = recent.length - inbound
  const latest = recent[0]
  const latestThread = latest ? byId.get(latest.thread_id) : undefined
  const latestSnippet = latest ? clampBody(latest.body).slice(0, 180) : ''

  const bits = [
    `${recent.length} recent message${recent.length === 1 ? '' : 's'} across ${channels.size} channel${channels.size === 1 ? '' : 's'} (${inbound} in / ${outbound} out).`,
    latest
      ? `Latest (${commChannelLabel(latestThread?.channel)} · ${latest.direction}): ${latestSnippet}`
      : null
  ].filter(Boolean)

  const openish = recent
    .filter((msg) => msg.direction === 'inbound')
    .slice(0, 2)
    .map((msg) => clampBody(msg.body).slice(0, 120))
  if (openish.length) {
    bits.push(`Recent inbound notes: ${openish.join(' · ')}`)
  }

  return bits.join(' ').slice(0, MAX_SUMMARY_CHARS)
}

async function summarizeWithAi(
  messages: CompassClientCommMessage[],
  threads: CompassClientCommThread[],
  clientName: string
): Promise<string> {
  const byId = new Map(threads.map((thread) => [thread.id, thread]))
  const lines = messages
    .slice()
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime())
    .slice(-MAX_MESSAGES_FOR_SUMMARY)
    .map((msg) => formatMessageLine(msg, byId.get(msg.thread_id)))

  const { output } = await generateText({
    model: defaultModel(),
    system: SYSTEM,
    prompt: JSON.stringify({
      clientName,
      messageCount: messages.length,
      messages: lines
    }),
    output: Output.object({ schema: summarySchema }),
    temperature: 0.2,
    maxOutputTokens: 500
  })

  if (!output?.summary?.trim()) throw new Error('empty_ai_output')

  const open = (output.openLoops ?? []).map((item) => item.trim()).filter(Boolean)
  let summary = output.summary.trim()
  if (open.length) {
    summary = `${summary} Open: ${open.join('; ')}.`
  }
  if (output.sentiment && output.sentiment !== 'neutral') {
    summary = `${summary} Tone: ${output.sentiment}.`
  }
  return summary.slice(0, MAX_SUMMARY_CHARS)
}

export type CommsSummaryResult = {
  summary: string
  source: CommSummarySource
}

export async function summarizeClientCommsSmart(
  messages: CompassClientCommMessage[],
  threads: CompassClientCommThread[],
  clientName: string
): Promise<CommsSummaryResult> {
  if (messages.length === 0) {
    return {
      summary: buildHeuristicCommsSummary(messages, threads),
      source: 'heuristic'
    }
  }

  if (isAiGatewayLikelyConfigured()) {
    try {
      const summary = await summarizeWithAi(messages, threads, clientName)
      if (summary.trim()) return { summary, source: 'ai' }
    } catch {
      /* fall through */
    }
  }

  return {
    summary: buildHeuristicCommsSummary(messages, threads),
    source: 'heuristic'
  }
}

export async function refreshClientCommsSummary(
  supabase: SupabaseClient,
  clientId: string,
  options?: { threadId?: string; refreshAllThreads?: boolean }
): Promise<CommsSummaryResult | null> {
  const [clientRes, threadsRes, messagesRes] = await Promise.all([
    supabase.from('compass_clients').select('id,name').eq('id', clientId).maybeSingle(),
    supabase
      .from('compass_client_comm_threads')
      .select('*')
      .eq('client_id', clientId)
      .neq('status', 'archived')
      .order('last_message_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('compass_client_comm_messages')
      .select('*')
      .eq('client_id', clientId)
      .order('occurred_at', { ascending: false })
      .limit(80)
  ])

  if (clientRes.error || !clientRes.data) return null
  if (threadsRes.error || messagesRes.error) return null

  const threads = (threadsRes.data ?? []) as CompassClientCommThread[]
  const messages = (messagesRes.data ?? []) as CompassClientCommMessage[]
  const result = await summarizeClientCommsSmart(
    messages,
    threads,
    String(clientRes.data.name || 'Client')
  )
  const stamp = nowIso()

  await supabase
    .from('compass_clients')
    .update({
      comms_summary: result.summary,
      comms_summary_at: stamp,
      comms_summary_source: result.source,
      updated_at: stamp,
      mirrored_at: stamp
    })
    .eq('id', clientId)

  const threadsToRefresh = options?.refreshAllThreads
    ? threads.slice(0, 12)
    : options?.threadId
      ? threads.filter((thread) => thread.id === options.threadId).slice(0, 1)
      : []

  for (const thread of threadsToRefresh) {
    const threadMessages = messages.filter((msg) => msg.thread_id === thread.id)
    if (threadMessages.length === 0) continue
    const threadResult = await summarizeClientCommsSmart(
      threadMessages,
      [thread],
      String(clientRes.data.name)
    )
    await supabase
      .from('compass_client_comm_threads')
      .update({
        summary: threadResult.summary,
        summary_at: stamp,
        updated_at: stamp
      })
      .eq('id', thread.id)
  }

  return result
}

export type ParsedCommIngest =
  | {
      clientId?: string
      clientSlug?: string
      threadExternalId: string
      channel?: CommChannel
      subject?: string
      participants: string[]
      message: {
        externalId?: string
        direction: CommDirection
        sender?: string
        body: string
        occurredAt: string
      }
    }
  | { error: string }

export function parseCommIngestBody(body: unknown): ParsedCommIngest {
  if (!body || typeof body !== 'object') return { error: 'invalid_body' }
  const raw = body as Record<string, unknown>

  const threadExternalId =
    (typeof raw.thread_external_id === 'string' && raw.thread_external_id.trim()) ||
    (typeof raw.threadExternalId === 'string' && raw.threadExternalId.trim()) ||
    ''
  if (!threadExternalId) return { error: 'thread_external_id_required' }

  const clientId =
    (typeof raw.client_id === 'string' && raw.client_id.trim()) ||
    (typeof raw.clientId === 'string' && raw.clientId.trim()) ||
    undefined
  const clientSlug =
    (typeof raw.client_slug === 'string' && raw.client_slug.trim()) ||
    (typeof raw.clientSlug === 'string' && raw.clientSlug.trim()) ||
    undefined

  const channelRaw = raw.channel
  const channel = isCommChannel(channelRaw) ? channelRaw : undefined
  const subject =
    typeof raw.subject === 'string' && raw.subject.trim() ? raw.subject.trim().slice(0, 240) : undefined
  const participants = normalizeParticipants(raw.participants)

  const messageRaw = (raw.message && typeof raw.message === 'object' ? raw.message : raw) as Record<
    string,
    unknown
  >
  const bodyText =
    (typeof messageRaw.body === 'string' && messageRaw.body.trim()) ||
    (typeof messageRaw.text === 'string' && messageRaw.text.trim()) ||
    ''
  if (!bodyText) return { error: 'message_body_required' }

  const direction = isCommDirection(messageRaw.direction) ? messageRaw.direction : 'inbound'
  const sender =
    typeof messageRaw.sender === 'string' && messageRaw.sender.trim()
      ? messageRaw.sender.trim().slice(0, 200)
      : undefined
  const externalId =
    (typeof messageRaw.external_id === 'string' && messageRaw.external_id.trim()) ||
    (typeof messageRaw.externalId === 'string' && messageRaw.externalId.trim()) ||
    (typeof messageRaw.message_id === 'string' && messageRaw.message_id.trim()) ||
    undefined
  const occurredRaw =
    (typeof messageRaw.occurred_at === 'string' && messageRaw.occurred_at) ||
    (typeof messageRaw.occurredAt === 'string' && messageRaw.occurredAt) ||
    (typeof messageRaw.sent_at === 'string' && messageRaw.sent_at) ||
    nowIso()
  const occurredAt = new Date(occurredRaw)
  if (!Number.isFinite(occurredAt.getTime())) return { error: 'invalid_occurred_at' }

  return {
    clientId,
    clientSlug,
    threadExternalId: threadExternalId.slice(0, 240),
    channel,
    subject,
    participants,
    message: {
      externalId: externalId?.slice(0, 240),
      direction,
      sender,
      body: bodyText.slice(0, 20_000),
      occurredAt: occurredAt.toISOString()
    }
  }
}
