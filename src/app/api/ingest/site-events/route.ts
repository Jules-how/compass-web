import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'
import { appendEvidenceBatch, type EvidenceEventInput } from '@/lib/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_TYPES = new Set(['page_view', 'cta.tel_click', 'cta.sms_click', 'form.submit'])

function ingestSecretConfigured(): string | null {
  const dedicated = process.env.COMPASS_SITE_EVENTS_SECRET?.trim()
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

type IncomingEvent = {
  id?: string
  ts?: string
  client_id?: string | null
  lead_id?: string | null
  type?: string
  payload?: Record<string, unknown>
  idempotency_key?: string
}

function parseEvents(body: unknown): IncomingEvent[] | null {
  if (Array.isArray(body)) return body as IncomingEvent[]
  if (body && typeof body === 'object') {
    const single = body as IncomingEvent & { events?: IncomingEvent[] }
    if (Array.isArray(single.events)) return single.events
    return [single]
  }
  return null
}

/**
 * Secret-authenticated event ingest for switchflow-sites beacons.
 * Contract: switchflow-sites/README.md. Source is forced to 'sites'; only the
 * four site event types are accepted. Idempotent on idempotency_key.
 */
export async function POST(request: Request) {
  const expected = ingestSecretConfigured()
  if (!expected) return portalJson({ error: 'ingest_not_configured' }, { status: 503 })

  const provided = request.headers.get('x-events-secret')
  if (!secretsMatch(provided, expected)) {
    return portalJson({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await readBoundedJson(request, 200_000)
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const incoming = parseEvents(body)
  if (!incoming || incoming.length === 0 || incoming.length > 200) {
    return portalJson({ error: 'invalid_events' }, { status: 400 })
  }

  const events: EvidenceEventInput[] = []
  const rejected: Array<{ index: number; reason: string }> = []
  incoming.forEach((event, index) => {
    const type = String(event.type ?? '')
    if (!ALLOWED_TYPES.has(type)) {
      rejected.push({ index, reason: 'unknown_type' })
      return
    }
    const nativeId =
      event.idempotency_key?.split(':').pop() || event.id || `beacon-${crypto.randomUUID()}`
    events.push({
      id: event.id,
      ts: event.ts,
      client_id: event.client_id ?? null,
      lead_id: event.lead_id ?? null,
      source: 'sites',
      type,
      product: 'sites',
      payload: event.payload ?? {},
      native_id: nativeId,
      idempotency_key: event.idempotency_key
    })
  })

  if (events.length === 0) {
    return portalJson({ error: 'no_valid_events', rejected }, { status: 400 })
  }

  try {
    const admin = getPortalAdminClient()
    const result = await appendEvidenceBatch(admin, events)
    return portalJson({ ok: true, attempted: result.attempted, rejected })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'write_failed'
    return portalJson({ error: message }, { status: 500 })
  }
}
