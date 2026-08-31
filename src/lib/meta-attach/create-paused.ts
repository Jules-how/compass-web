import type {
  MetaAttachReview,
  MetaGraphAdapter,
  MetaGraphAdInput,
  MetaGraphAdSetInput,
  MetaGraphCampaignInput,
  MetaGraphCreativeInput,
  MetaGraphImageInput,
  MetaAttachMetaIds,
  MetaAttachRow,
  MetaPackOfferCell
} from '@/lib/meta-attach/types'

export type PushValidationResult =
  | { ok: true }
  | { ok: false; error: string }

export function validatePushReady(row: MetaAttachRow): PushValidationResult {
  if (row.status === 'archived') return { ok: false, error: 'archived' }
  if (row.status === 'live') return { ok: false, error: 'already_live' }

  const review = row.review as MetaAttachReview
  const designIds = Object.values(row.canva_design_ids ?? {}).filter(Boolean)
  if (designIds.length === 0) {
    return { ok: false, error: 'canva_design_id_required' }
  }

  const imageUrls = (review.exported_image_urls ?? []).filter(Boolean)
  if (imageUrls.length === 0) {
    return { ok: false, error: 'exported_image_url_required' }
  }

  if (review.ai_generated_only) {
    return { ok: false, error: 'ai_generated_only_refused' }
  }

  if (!review.meta_ad_account_id?.trim()) {
    return { ok: false, error: 'meta_ad_account_id_required' }
  }
  if (!review.meta_page_id?.trim()) {
    return { ok: false, error: 'meta_page_id_required' }
  }

  if (!row.destination_url?.trim()) {
    return { ok: false, error: 'destination_url_required' }
  }

  const copy = row.copy
  if (!copy.primary_texts?.[0]?.trim() || !copy.headlines?.[0]?.trim()) {
    return { ok: false, error: 'copy_incomplete' }
  }

  return { ok: true }
}

export function buildTargetingFromBrief(
  brief: Record<string, unknown>,
  suburbs: string[]
): Record<string, unknown> {
  const defaults = (brief.targeting_defaults ?? {}) as Record<string, unknown>
  const radiusKm = Number(defaults.geo_radius_km ?? 25)
  const ageMin = Number(defaults.age_min ?? 25)
  const ageMax = Number(defaults.age_max ?? 65)

  const cities = suburbs
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((name) => ({ key: `${name}, AU`, radius: radiusKm, distance_unit: 'kilometer' }))

  return {
    age_min: ageMin,
    age_max: ageMax,
    geo_locations: {
      custom_locations: cities.length > 0 ? cities : [{ key: 'Australia', radius: radiusKm, distance_unit: 'kilometer' }]
    },
    targeting_automation: {
      advantage_audience: 0
    }
  }
}

export function campaignName(row: MetaAttachRow, clientName: string, vertical: string): string {
  const dest = String(row.creative_brief.destination_type ?? 'WEBSITE').toLowerCase()
  const slug = clientName.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 24)
  return `${slug}_${vertical}_${row.offer_cell}_${dest}_paused`.toLowerCase()
}

export type OrchestratePausedInput = {
  row: MetaAttachRow
  clientName: string
  vertical: string
  offerCell: MetaPackOfferCell
  serviceSuburbs: string[]
  adapter: MetaGraphAdapter
}

export type OrchestratePausedResult = {
  meta_ids: MetaAttachMetaIds
  created: { campaign: boolean; adset: boolean; creatives: number; ads: number }
}

export async function orchestratePausedCreate(
  input: OrchestratePausedInput
): Promise<OrchestratePausedResult> {
  const validation = validatePushReady(input.row)
  if (!validation.ok) throw new Error(validation.error)

  const review = input.row.review as MetaAttachReview
  const adAccountId = normalizeActId(review.meta_ad_account_id!)
  const pageId = review.meta_page_id!.trim()
  const imageUrls = (review.exported_image_urls ?? []).filter(Boolean)
  const existing = input.row.meta_ids ?? {}
  const created = { campaign: false, adset: false, creatives: 0, ads: 0 }

  let campaignId = existing.campaign_id
  if (!campaignId) {
    const campaignInput: MetaGraphCampaignInput = {
      adAccountId,
      name: campaignName(input.row, input.clientName, input.vertical)
    }
    const campaign = await input.adapter.ensureCampaignPaused(campaignInput)
    campaignId = campaign.id
    created.campaign = true
  }

  let adsetId = existing.adset_id
  if (!adsetId) {
    const dailyBudget = Number(input.row.creative_brief.budget_default_daily ?? 30)
    const adSetInput: MetaGraphAdSetInput = {
      adAccountId,
      campaignId,
      name: `${input.row.offer_cell}_adset_paused`,
      dailyBudget,
      pageId,
      destinationUrl: input.row.destination_url!,
      targeting: buildTargetingFromBrief(input.row.creative_brief, input.serviceSuburbs),
      optimizationGoal: 'LEAD_GENERATION',
      destinationType: String(input.row.creative_brief.destination_type ?? 'WEBSITE')
    }
    const adset = await input.adapter.ensureAdSetPaused(adSetInput)
    adsetId = adset.id
    created.adset = true
  }

  const creativeIds = [...(existing.creative_ids ?? [])]
  const adIds = [...(existing.ad_ids ?? [])]
  const cta = String(input.row.creative_brief.cta ?? 'GET_QUOTE')
  const primary = input.row.copy.primary_texts[0]
  const headline = input.row.copy.headlines[0]
  const description = input.row.copy.descriptions[0] ?? ''

  const startIndex = creativeIds.length
  for (let i = startIndex; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i]!
    const imageInput: MetaGraphImageInput = { adAccountId, imageUrl }
    const uploaded = await input.adapter.uploadImage(imageInput)

    const creativeInput: MetaGraphCreativeInput = {
      adAccountId,
      pageId,
      name: `${input.row.offer_cell}_creative_${i + 1}`,
      primaryText: primary,
      headline,
      description,
      link: input.row.destination_url!,
      imageHash: uploaded.hash,
      cta
    }
    const creative = await input.adapter.createCreative(creativeInput)
    creativeIds.push(creative.id)
    created.creatives += 1

    const adInput: MetaGraphAdInput = {
      adAccountId,
      adSetId: adsetId,
      name: `${input.row.offer_cell}_ad_${i + 1}_paused`,
      creativeId: creative.id
    }
    const ad = await input.adapter.createAdPaused(adInput)
    adIds.push(ad.id)
    created.ads += 1
  }

  return {
    meta_ids: {
      campaign_id: campaignId,
      adset_id: adsetId,
      creative_ids: creativeIds,
      ad_ids: adIds
    },
    created
  }
}

function normalizeActId(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('act_')) return trimmed
  return `act_${trimmed.replace(/^act_/, '')}`
}

export function adsManagerDeepLink(metaIds: MetaAttachMetaIds, adAccountId?: string): string | null {
  const campaignId = metaIds.campaign_id
  if (!campaignId) return null
  const act = adAccountId ? normalizeActId(adAccountId) : null
  const base = 'https://adsmanager.facebook.com/adsmanager/manage/campaigns'
  const params = new URLSearchParams({ selected_campaign_ids: campaignId })
  if (act) params.set('act', act.replace(/^act_/, ''))
  return `${base}?${params.toString()}`
}
