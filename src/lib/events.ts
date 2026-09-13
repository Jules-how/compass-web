import type { SupabaseClient } from '@supabase/supabase-js'

export type EvidenceEventInput = {
  id?: string
  ts?: string
  client_id?: string | null
  lead_id?: string | null
  source: string
  type: string
  vertical?: string | null
  offer?: string | null
  product?: string | null
  messaging_component?: string | null
  campaign?: string | null
  offer_revision_id?: string | null
  market_test_id?: string | null
  opportunity_id?: string | null
  engagement_id?: string | null
  payload?: Record<string, unknown>
  /** Native id used to build idempotency_key when key omitted. */
  native_id: string
  idempotency_key?: string
}

export type EvidenceEventRow = {
  id: string
  ts: string
  client_id: string | null
  lead_id: string | null
  source: string
  type: string
  vertical: string | null
  offer: string | null
  product: string | null
  messaging_component: string | null
  campaign: string | null
  offer_revision_id: string | null
  market_test_id: string | null
  opportunity_id: string | null
  engagement_id: string | null
  payload: Record<string, unknown>
  idempotency_key: string
  created_at: string
}

export type ListEvidenceOptions = {
  since?: string
  kind?: string
  subject?: { lead_id?: string; client_id?: string }
  limit?: number
}

function buildIdempotencyKey(source: string, type: string, nativeId: string): string {
  return `${source}:${type}:${nativeId}`
}

function normalizeRow(input: EvidenceEventInput): Record<string, unknown> {
  const ts = input.ts ?? new Date().toISOString()
  const idempotency_key =
    input.idempotency_key ?? buildIdempotencyKey(input.source, input.type, input.native_id)
  return {
    id: input.id ?? `evt-${crypto.randomUUID()}`,
    ts,
    client_id: input.client_id ?? null,
    lead_id: input.lead_id ?? null,
    source: input.source,
    type: input.type,
    vertical: input.vertical ?? null,
    offer: input.offer ?? null,
    product: input.product ?? null,
    messaging_component: input.messaging_component ?? null,
    campaign: input.campaign ?? null,
    offer_revision_id: input.offer_revision_id ?? null,
    market_test_id: input.market_test_id ?? null,
    opportunity_id: input.opportunity_id ?? null,
    engagement_id: input.engagement_id ?? null,
    payload: input.payload ?? {},
    idempotency_key
  }
}

/** Append one evidence event (no-op on duplicate idempotency_key). */
export async function appendEvidence(
  supabase: SupabaseClient,
  event: EvidenceEventInput
): Promise<{ inserted: boolean; id: string }> {
  const row = normalizeRow(event)
  const { error } = await supabase
    .from('compass_evidence_events')
    .upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  return { inserted: true, id: String(row.id) }
}

/** Batch append evidence events (conflict-safe). */
export async function appendEvidenceBatch(
  supabase: SupabaseClient,
  events: EvidenceEventInput[]
): Promise<{ attempted: number }> {
  if (events.length === 0) return { attempted: 0 }
  const rows = events.map((event) => normalizeRow(event))
  const { error } = await supabase
    .from('compass_evidence_events')
    .upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  return { attempted: rows.length }
}

/** List evidence events for digest matching and pollers. */
export async function listEvidence(
  supabase: SupabaseClient,
  options: ListEvidenceOptions = {}
): Promise<EvidenceEventRow[]> {
  let query = supabase
    .from('compass_evidence_events')
    .select(
      'id,ts,client_id,lead_id,source,type,vertical,offer,product,messaging_component,campaign,offer_revision_id,market_test_id,opportunity_id,engagement_id,payload,idempotency_key,created_at'
    )
    .order('ts', { ascending: true })

  if (options.since) query = query.gte('ts', options.since)
  if (options.kind) query = query.eq('type', options.kind)
  if (options.subject?.lead_id) query = query.eq('lead_id', options.subject.lead_id)
  if (options.subject?.client_id) query = query.eq('client_id', options.subject.client_id)
  if (options.limit) query = query.limit(options.limit)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as EvidenceEventRow[]
}

export { buildIdempotencyKey }
