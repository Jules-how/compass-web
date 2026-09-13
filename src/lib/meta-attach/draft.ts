import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { appendEvidence } from '@/lib/events'
import { buildDraftPayload } from '@/lib/meta-attach/draft-merge'
import { loadMetaPack, resolveTradePackId } from '@/lib/meta-attach/pack'
import type { ClientFactsForMetaAttach, MetaAttachRow } from '@/lib/meta-attach/types'
import { getDeliveryEngagement } from '@/lib/offer-revisions'

export async function createMetaAttachDraft(
  supabase: SupabaseClient,
  input: {
    client: ClientFactsForMetaAttach
    offerCell?: string
    packId?: string
    destinationUrl?: string
  }
): Promise<MetaAttachRow> {
  const engagement = await getDeliveryEngagement(supabase, input.client.id)
  const onboarding = engagement.onboarding_snapshot.answers ?? {}
  const pinnedClient: ClientFactsForMetaAttach = {
    ...input.client,
    deal_terms: {
      delivery: {
        ...onboarding,
        services_offered: onboarding.installation_services,
        service_suburbs: onboarding.service_areas
      }
    }
  }
  const packId = input.packId?.trim() || resolveTradePackId(pinnedClient)
  const pack = loadMetaPack(packId)
  const offerCell =
    input.offerCell?.trim() ||
    pack.default_offer_cell ||
    Object.keys(pack.offer_cells)[0]

  const draft = buildDraftPayload({
    client: pinnedClient,
    pack,
    offerCell,
    destinationUrl: input.destinationUrl
  })

  const id = `mattach-${crypto.randomUUID()}`
  const stamp = new Date().toISOString()
  const row = {
    id,
    client_id: input.client.id,
    offer_revision_id: engagement.offer_revision_id,
    engagement_id: engagement.id,
    source_snapshot: {
      engagement_id: engagement.id,
      offer_revision_id: engagement.offer_revision_id,
      accepted_terms: engagement.accepted_terms,
      onboarding: engagement.onboarding_snapshot
    },
    status: 'draft' as const,
    offer_cell: draft.offer_cell,
    destination_url: draft.destination_url,
    copy: draft.copy,
    creative_brief: draft.creative_brief,
    canva_design_ids: {},
    meta_ids: {},
    review: draft.review,
    created_at: stamp,
    updated_at: stamp
  }

  const { error } = await supabase.from('compass_meta_attach').insert(row)
  if (error) throw new Error(error.message)

  await emitMetaAttachEvent(supabase, {
    clientId: input.client.id,
    type: 'meta.attach.draft_created',
    nativeId: id,
    vertical: pack.vertical,
    offer: draft.offer_cell,
    offer_revision_id: engagement.offer_revision_id,
    engagement_id: engagement.id,
    payload: { pack_id: packId, offer_cell: draft.offer_cell }
  })

  return row as MetaAttachRow
}

export async function emitMetaAttachEvent(
  supabase: SupabaseClient,
  input: {
    clientId: string
    type: string
    nativeId: string
    vertical?: string
    offer?: string
    payload?: Record<string, unknown>
    offer_revision_id?: string
    engagement_id?: string
  }
): Promise<void> {
  await appendEvidence(supabase, {
    client_id: input.clientId,
    source: 'meta_attach',
    type: input.type,
    vertical: input.vertical ?? null,
    offer: input.offer ?? null,
    product: 'meta_attach',
    offer_revision_id: input.offer_revision_id ?? null,
    engagement_id: input.engagement_id ?? null,
    native_id: input.nativeId,
    payload: input.payload ?? {}
  })
}
