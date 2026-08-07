import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

const COMM_CHANNELS = ['email', 'sms', 'call', 'other']
const COMM_DIRECTIONS = ['inbound', 'outbound']

function isCommChannel(value) {
  return typeof value === 'string' && COMM_CHANNELS.includes(value)
}

function isCommDirection(value) {
  return typeof value === 'string' && COMM_DIRECTIONS.includes(value)
}

function normalizeParticipants(value) {
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

/** Mirror of parseCommIngestBody / buildHeuristicCommsSummary without TS imports. */
function parseCommIngestBody(body) {
  if (!body || typeof body !== 'object') return { error: 'invalid_body' }
  const raw = body
  const threadExternalId =
    (typeof raw.thread_external_id === 'string' && raw.thread_external_id.trim()) ||
    (typeof raw.threadExternalId === 'string' && raw.threadExternalId.trim()) ||
    ''
  if (!threadExternalId) return { error: 'thread_external_id_required' }

  const messageRaw = raw.message && typeof raw.message === 'object' ? raw.message : raw
  const bodyText =
    (typeof messageRaw.body === 'string' && messageRaw.body.trim()) ||
    (typeof messageRaw.text === 'string' && messageRaw.text.trim()) ||
    ''
  if (!bodyText) return { error: 'message_body_required' }

  return {
    clientSlug:
      (typeof raw.client_slug === 'string' && raw.client_slug.trim()) ||
      (typeof raw.clientSlug === 'string' && raw.clientSlug.trim()) ||
      undefined,
    threadExternalId: threadExternalId.slice(0, 240),
    channel: isCommChannel(raw.channel) ? raw.channel : undefined,
    participants: normalizeParticipants(raw.participants),
    message: {
      body: bodyText.slice(0, 20_000),
      direction: isCommDirection(messageRaw.direction) ? messageRaw.direction : 'inbound'
    }
  }
}

function buildHeuristicCommsSummary(messages, threads) {
  if (messages.length === 0) {
    return 'No linked communications yet. Link an email or SMS thread to start gathering context.'
  }
  const byId = new Map(threads.map((thread) => [thread.id, thread]))
  const recent = [...messages].slice(0, 8)
  const channels = new Set(recent.map((msg) => byId.get(msg.thread_id)?.channel || 'email'))
  const inbound = recent.filter((msg) => msg.direction === 'inbound').length
  const outbound = recent.length - inbound
  const latest = recent[0]
  return `${recent.length} recent message${recent.length === 1 ? '' : 's'} across ${channels.size} channel${channels.size === 1 ? '' : 's'} (${inbound} in / ${outbound} out). Latest: ${latest?.body || ''}`
}

test('comms migration creates threads/messages with operator RLS', () => {
  const migration = read('supabase/migrations/0031_compass_client_comms.sql')
  assert.match(migration, /compass_client_comm_threads/)
  assert.match(migration, /compass_client_comm_messages/)
  assert.match(migration, /comms_summary/)
  assert.match(migration, /portal_is_operator/)
  assert.match(migration, /external_id/)
})

test('parseCommIngestBody requires thread external id and message body', () => {
  assert.deepEqual(parseCommIngestBody({}), { error: 'thread_external_id_required' })
  assert.deepEqual(parseCommIngestBody({ thread_external_id: 't1' }), {
    error: 'message_body_required'
  })

  const parsed = parseCommIngestBody({
    client_slug: 'kleanly',
    thread_external_id: 'gmail-abc',
    channel: 'email',
    participants: 'a@b.com, c@d.com',
    message: {
      direction: 'inbound',
      body: 'Can we chat tomorrow?'
    }
  })
  assert.equal('error' in parsed, false)
  if ('error' in parsed) return
  assert.equal(parsed.clientSlug, 'kleanly')
  assert.equal(parsed.threadExternalId, 'gmail-abc')
  assert.equal(parsed.channel, 'email')
  assert.equal(parsed.message.body, 'Can we chat tomorrow?')
  assert.deepEqual(parsed.participants, ['a@b.com', 'c@d.com'])
})

test('heuristic summary covers empty and recent messages', () => {
  assert.match(buildHeuristicCommsSummary([], []), /No linked communications/)
  const summary = buildHeuristicCommsSummary(
    [
      {
        id: 'm1',
        thread_id: 't1',
        direction: 'inbound',
        body: 'Please send the proposal today.'
      }
    ],
    [{ id: 't1', channel: 'email' }]
  )
  assert.match(summary, /1 recent message/)
  assert.match(summary, /proposal/i)
})

test('normalizeParticipants and channel guards', () => {
  assert.deepEqual(normalizeParticipants('a@b.com; c@d.com'), ['a@b.com', 'c@d.com'])
  assert.equal(isCommChannel('email'), true)
  assert.equal(isCommChannel('fax'), false)
})

test('client comms routes are operator-gated; ingest uses service role', () => {
  const list = read('src/app/api/clients/[id]/comms/route.ts')
  const thread = read('src/app/api/clients/[id]/comms/[threadId]/route.ts')
  const messages = read('src/app/api/clients/[id]/comms/[threadId]/messages/route.ts')
  const ingest = read('src/app/api/ingest/comms/route.ts')
  const panel = read('src/components/clients/ClientCommsPanel.tsx')
  const detail = read('src/components/clients/ClientDetailPanel.tsx')
  const lib = read('src/lib/client-comms.ts')

  for (const source of [list, thread, messages]) {
    assert.match(source, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
    assert.match(source, /requireSameOrigin/)
  }
  assert.match(ingest, /getPortalAdminClient/)
  assert.match(ingest, /x-ingest-secret/)
  assert.match(ingest, /thread_not_linked/)
  assert.match(lib, /summarizeClientCommsSmart/)
  assert.match(panel, /Refresh summary/)
  assert.match(detail, /\['comms', 'Comms'\]/)
  assert.match(detail, /ClientCommsPanel/)
})
