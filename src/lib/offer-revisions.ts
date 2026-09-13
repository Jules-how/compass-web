import type { SupabaseClient } from '@supabase/supabase-js'

export const ACTIVE_SERVICE_OFFER_KEY = 'installation-booking'

export type OfferRevision = {
  id: string
  offer_id: string
  version_no: number
  version_label: string
  snapshot_scope: 'full' | 'preparation_context'
  snapshot: Record<string, unknown>
  content_hash: string
  change_reason: string
  source: string
  supersedes_revision_id: string | null
  created_by: string
  created_at: string
}

export type ActiveOfferRevision = {
  offerId: string
  offerKey: string
  offerName: string
  revision: OfferRevision
}

export type MarketTest = {
  id: string
  offer_revision_id: string
  name: string
  hypothesis: string
  vertical: string
  geography: string
  channel: string
  status: 'planned' | 'running' | 'paused' | 'won' | 'lost' | 'inconclusive' | 'cancelled'
  sample_size_target: number | null
  budget_aud: number | null
  stop_conditions: Record<string, unknown>
  started_at: string | null
  closed_at: string | null
  closeout: Record<string, unknown> | null
  created_by: string
  created_at: string
  updated_at: string
}

export type DeliveryEngagement = {
  id: string
  client_id: string
  offer_key: string
  offer_revision_id: string
  agreement_id: string
  status: 'onboarding' | 'active'
  accepted_terms: Record<string, unknown>
  onboarding_snapshot: {
    answers?: Record<string, unknown>
    submitted_at?: string
    form_id?: string
  }
}

const OFFER_CONTENT_FIELDS = new Set([
  'offer_key',
  'name',
  'pack_summary',
  'positioning_line',
  'vertical_tags',
  'location_tags',
  'one_sentence',
  'dream_outcome',
  'install_aud',
  'retainer_low_aud',
  'retainer_high_aud',
  'term_days',
  'guarantee',
  'lock'
])

export function hasOfferContentPatch(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((key) => OFFER_CONTENT_FIELDS.has(key))
}

export async function reviseOffer(
  db: SupabaseClient,
  input: {
    offerId: string
    patch: Record<string, unknown>
    expectedActiveRevisionId: string | null
    changeReason: string
    createdBy: string
  }
): Promise<Record<string, unknown>> {
  const { data, error } = await db.rpc('compass_revise_offer', {
    p_offer_id: input.offerId,
    p_patch: input.patch,
    p_expected_active_revision_id: input.expectedActiveRevisionId,
    p_change_reason: input.changeReason,
    p_created_by: input.createdBy
  })
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('offer_revision_failed')
  return data as Record<string, unknown>
}

export async function getActiveOfferRevision(
  db: SupabaseClient,
  offerKey = ACTIVE_SERVICE_OFFER_KEY
): Promise<ActiveOfferRevision> {
  const offerResult = await db
    .from('compass_outbound_offers')
    .select('id,offer_key,name,active_revision_id')
    .eq('offer_key', offerKey)
    .maybeSingle()
  if (offerResult.error) throw new Error(offerResult.error.message)
  if (!offerResult.data) throw new Error('active_offer_not_found')
  if (!offerResult.data.active_revision_id) throw new Error('active_offer_revision_required')

  const revisionResult = await db
    .from('compass_offer_revisions')
    .select('*')
    .eq('id', offerResult.data.active_revision_id)
    .eq('snapshot_scope', 'full')
    .maybeSingle()
  if (revisionResult.error) throw new Error(revisionResult.error.message)
  if (!revisionResult.data) throw new Error('active_offer_revision_not_found')

  return {
    offerId: String(offerResult.data.id),
    offerKey: String(offerResult.data.offer_key),
    offerName: String(offerResult.data.name),
    revision: revisionResult.data as OfferRevision
  }
}

export function marketTestId(offerRevisionId: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'test'
  return `market-test-${slug}-${crypto.randomUUID()}`
}

export async function getDeliveryEngagement(
  db: SupabaseClient,
  clientId: string
): Promise<DeliveryEngagement> {
  const result = await db
    .from('compass_client_engagements')
    .select('id,client_id,offer_key,offer_revision_id,agreement_id,status,accepted_terms,onboarding_snapshot,updated_at')
    .eq('client_id', clientId)
    .eq('offer_key', ACTIVE_SERVICE_OFFER_KEY)
    .in('status', ['onboarding', 'active'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error) throw new Error(result.error.message)
  if (!result.data?.onboarding_snapshot) throw new Error('completed_onboarding_engagement_required')
  return result.data as DeliveryEngagement
}
