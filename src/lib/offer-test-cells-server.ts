import type { SupabaseClient } from '@supabase/supabase-js'

import {
  defaultGoLiveAt,
  normalizeCtaType,
  type CompassCampaign
} from '@/lib/campaigns'
import {
  getPipelineCampaignRow,
  insertPipelineCampaign,
  updatePipelineCampaignRow,
  type CampaignWriteInput
} from '@/lib/campaigns-server'
import {
  MAX_CELLS_PER_REQUEST,
  cellCampaignName,
  existingCellKey,
  isCityOrphan,
  missingPlanSlots,
  parseSampleSizeTarget,
  uniqueTags
} from '@/lib/offer-test-cells'

export type CreateOfferCellsInput = {
  offer_key: string
  verticals: string[]
  cities: string[]
  testing_variable?: string | null
  clone_campaign_id?: string | null
  sample_size_target?: unknown
  hypothesis?: string | null
}

export type CreateOfferCellsResult = {
  created: Array<{ id: string; name: string; vertical: string; city: string; adopted: boolean }>
  skipped: number
  requested: number
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return uniqueTags(value.map((item) => (typeof item === 'string' ? item : '')).filter(Boolean))
}

export function parseCreateOfferCellsBody(body: Record<string, unknown>): CreateOfferCellsInput | { error: string } {
  const offer_key = typeof body.offer_key === 'string' ? body.offer_key.trim() : ''
  if (!offer_key) return { error: 'offer_key_required' }
  const verticals = asStringList(body.verticals)
  const cities = asStringList(body.cities)
  if (verticals.length === 0) return { error: 'verticals_required' }
  if (cities.length === 0) return { error: 'cities_required' }
  const slots = verticals.length * cities.length
  if (slots > MAX_CELLS_PER_REQUEST) return { error: 'too_many_cells' }
  const sample = parseSampleSizeTarget(body.sample_size_target)
  if (body.sample_size_target != null && body.sample_size_target !== '' && sample == null) {
    return { error: 'sample_size_target_invalid' }
  }
  return {
    offer_key,
    verticals,
    cities,
    testing_variable: typeof body.testing_variable === 'string' ? body.testing_variable : null,
    clone_campaign_id: typeof body.clone_campaign_id === 'string' ? body.clone_campaign_id.trim() || null : null,
    sample_size_target: sample,
    hypothesis: typeof body.hypothesis === 'string' ? body.hypothesis.trim() || null : null
  }
}

function copyFieldsFromClone(clone: CompassCampaign | null): Partial<CampaignWriteInput> {
  if (!clone) return {}
  const hasSequence = Boolean(clone.sequence_draft)
  return {
    structure_id: clone.structure_id ?? null,
    opener_mode: clone.opener_mode ?? null,
    cold_expression: clone.cold_expression ?? null,
    sequence_draft: clone.sequence_draft ?? null,
    copy_status: hasSequence ? 'draft' : clone.copy_status || 'none'
  }
}

export async function createMissingOfferCells(
  supabase: SupabaseClient,
  input: CreateOfferCellsInput
): Promise<CreateOfferCellsResult> {
  const sample =
    typeof input.sample_size_target === 'number' ? input.sample_size_target : parseSampleSizeTarget(input.sample_size_target)
  const offerRes = await supabase
    .from('compass_outbound_offers')
    .select('offer_key')
    .eq('offer_key', input.offer_key)
    .maybeSingle()
  if (offerRes.error) throw new Error(offerRes.error.message)
  if (!offerRes.data) throw new Error('offer_not_found')
  let clone: CompassCampaign | null = null
  if (input.clone_campaign_id) {
    clone = await getPipelineCampaignRow(supabase, input.clone_campaign_id)
    if (!clone) throw new Error('clone_not_found')
  }
  const cloneWrite = copyFieldsFromClone(clone)
  const extra: Partial<CampaignWriteInput> = {}
  if (clone) {
    extra.expression_key = clone.expression_key ?? null
    extra.cta_type = typeof clone.cta_type === 'string' ? clone.cta_type : null
  }

  const existingRes = await supabase
    .from('compass_pipeline_campaigns')
    .select('id,name,offer_key,vertical_tags,location_tags')
    .eq('offer_key', input.offer_key)
  if (existingRes.error) throw new Error(existingRes.error.message)
  const existing = (existingRes.data ?? []) as Array<{
    id: string
    name: string
    offer_key?: string | null
    vertical_tags?: string[] | null
    location_tags?: string[] | null
  }>
  const have = new Set(existing.map((row) => existingCellKey(row)))
  const slots = missingPlanSlots(input.offer_key, input.verticals, input.cities, have)
  const created: CreateOfferCellsResult['created'] = []
  const adoptedIds = new Set<string>()
  const goLive = defaultGoLiveAt()

  for (const slot of slots) {
    const orphan = existing.find(
      (row) => isCityOrphan(row, input.offer_key, slot.vertical) && !adoptedIds.has(row.id)
    )
    if (orphan) {
      await updatePipelineCampaignRow(supabase, orphan.id, {
        location_tags: [slot.city],
        testing_variable: input.testing_variable,
        sample_size_target: sample,
        hypothesis: input.hypothesis,
        ...cloneWrite,
        ...extra
      })
      adoptedIds.add(orphan.id)
      have.add(slot.key)
      created.push({
        id: orphan.id,
        name: orphan.name,
        vertical: slot.vertical,
        city: slot.city,
        adopted: true
      })
      continue
    }
    const campaign = await insertPipelineCampaign(supabase, {
      name: cellCampaignName(slot.city, slot.vertical),
      status: 'planned',
      go_live_at: goLive,
      offer_key: input.offer_key,
      vertical_tags: [slot.vertical],
      location_tags: [slot.city],
      testing_variable: input.testing_variable,
      hypothesis: input.hypothesis,
      sample_size_target: sample,
      wave_lane: 'next',
      wave_list_size: sample,
      ...cloneWrite,
      ...extra
    })
    have.add(slot.key)
    created.push({
      id: campaign.id,
      name: campaign.name,
      vertical: slot.vertical,
      city: slot.city,
      adopted: false
    })
  }

  const requested = input.verticals.length * input.cities.length
  return {
    created,
    skipped: requested - created.length,
    requested
  }
}
