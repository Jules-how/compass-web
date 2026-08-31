export type MetaAttachStatus = 'draft' | 'briefed' | 'created_paused' | 'live' | 'archived'

export type MetaAttachCopy = {
  primary_texts: string[]
  headlines: string[]
  descriptions: string[]
}

export type MetaAttachMetaIds = {
  campaign_id?: string
  adset_id?: string
  creative_ids?: string[]
  ad_ids?: string[]
}

export type MetaAttachReview = {
  meta_ad_account_id?: string
  meta_page_id?: string
  exported_image_urls?: string[]
  ai_generated_only?: boolean
  years_in_business?: number
  notes?: string
}

export type CanvaDesignIds = {
  square?: string
  portrait?: string
  [key: string]: string | undefined
}

export type MetaAttachRow = {
  id: string
  client_id: string
  status: MetaAttachStatus
  offer_cell: string
  destination_url: string | null
  copy: MetaAttachCopy
  creative_brief: Record<string, unknown>
  canva_design_ids: CanvaDesignIds
  meta_ids: MetaAttachMetaIds
  review: MetaAttachReview
  created_at: string
  updated_at: string
}

export type MetaPackOfferCell = {
  label: string
  messaging: string
  destination_type: string
  cta: string
  primary_texts: string[]
  headlines: string[]
  descriptions: string[]
  creative_brief: Record<string, unknown>
  targeting_defaults: Record<string, unknown>
  budget_default_daily: number
  negative_notes: string[]
}

export type MetaPack = {
  pack_id: string
  vertical: string
  trade_label: string
  default_offer_cell: string
  offer_cells: Record<string, MetaPackOfferCell>
}

export type ClientFactsForMetaAttach = {
  id: string
  name: string
  industry?: string | null
  deal_terms?: { delivery?: Record<string, unknown> } | null
  voice?: Record<string, unknown> | null
}

export type MetaGraphCampaignInput = {
  adAccountId: string
  name: string
  objective?: string
}

export type MetaGraphAdSetInput = {
  adAccountId: string
  campaignId: string
  name: string
  dailyBudget: number
  pageId: string
  destinationUrl: string
  targeting: Record<string, unknown>
  optimizationGoal?: string
  destinationType?: string
}

export type MetaGraphImageInput = {
  adAccountId: string
  imageUrl: string
}

export type MetaGraphCreativeInput = {
  adAccountId: string
  pageId: string
  name: string
  primaryText: string
  headline: string
  description: string
  link: string
  imageHash: string
  cta: string
}

export type MetaGraphAdInput = {
  adAccountId: string
  adSetId: string
  name: string
  creativeId: string
}

export interface MetaGraphAdapter {
  readonly driver: 'composio' | 'direct'
  readonly configured: boolean
  ensureCampaignPaused(input: MetaGraphCampaignInput): Promise<{ id: string }>
  ensureAdSetPaused(input: MetaGraphAdSetInput): Promise<{ id: string }>
  uploadImage(input: MetaGraphImageInput): Promise<{ hash: string }>
  createCreative(input: MetaGraphCreativeInput): Promise<{ id: string }>
  createAdPaused(input: MetaGraphAdInput): Promise<{ id: string }>
  fetchAdInsights?(input: {
    adAccountId: string
    adIds: string[]
    datePreset?: string
  }): Promise<
    Array<{
      ad_id: string
      spend: number
      leads: number
      date_start?: string
      date_stop?: string
    }>
  >
}

export type MetaAttachDriverConfig =
  | { ok: true; driver: 'composio' | 'direct'; adapter: MetaGraphAdapter }
  | { ok: false; driver: 'composio' | 'direct' | 'none'; error: string }
