export type GoogleMatchType = 'PHRASE' | 'EXACT' | 'BROAD'

export type GooglePackRsaTemplate = {
  headlines: string[]
  descriptions: string[]
}

export type GooglePackCluster = {
  id: string
  name: string
  keywords: string[]
  rsa_templates: GooglePackRsaTemplate[]
}

export type GooglePack = {
  pack_id: string
  trade: string
  locale: 'en-AU'
  default_match_types: GoogleMatchType[]
  shared_negatives: string[]
  clusters: GooglePackCluster[]
  assets: {
    sitelinks: Array<{
      text: string
      url: string
      description1?: string
      description2?: string
    }>
    callouts: string[]
  }
  conversion_action: {
    name: string
    type: 'WEBPAGE' | 'AD_CALL' | 'WEBSITE_CALL' | 'UPLOAD_CLICKS'
    category: string
  }
}

export type GoogleAttachKeyword = {
  text: string
  match: GoogleMatchType
}

export type GoogleAttachRsa = {
  headlines: string[]
  descriptions: string[]
}

export type GoogleAttachAdGroup = {
  name: string
  cluster_id: string
  keywords: GoogleAttachKeyword[]
  rsas: GoogleAttachRsa[]
}

export type GoogleAttachPlanGeo = {
  pending: boolean
  suburbs: string[]
  locations: Array<{
    input: string
    name: string
    resource_name: string
    target_type: string | null
    country_code: string
  }>
  unresolved: string[]
  proximity_fallback: {
    enabled: boolean
    radius_km: number
    anchor: {
      input: string
      name: string
      resource_name: string
      target_type: string | null
      country_code: string
    }
    address: {
      city_name: string
      country_code: string
    }
  } | null
  locale: string
  country_code: string
}

export type GoogleAttachPlan = {
  campaign_name: string
  daily_budget_aud: number
  destination_url: string
  geo?: GoogleAttachPlanGeo
  ad_groups: GoogleAttachAdGroup[]
  negatives: string[]
  assets: {
    sitelinks: Array<{
      text: string
      url: string
      description1?: string
      description2?: string
    }>
    callouts: string[]
    call: {
      phone_number: string
      country_code: string
    }
  }
  conversion_action: {
    name: string
    type: string
    category: string
  }
}

export type GoogleAttachStatus = 'draft' | 'created_paused' | 'live' | 'archived'

export type GoogleAttachGoogleIds = {
  budget_resource?: string
  campaign_resource?: string
  ad_groups?: Record<string, string>
  keywords?: string[]
  rsas?: string[]
  sitelink_assets?: string[]
  callout_assets?: string[]
  call_asset?: string
  shared_negative_set?: string
  shared_negative_criteria?: string[]
  shared_negative_keywords_expected?: number
  campaign_shared_set?: string
  geo_criteria?: string[]
  conversion_action?: string
  customer_client_link?: string
  manager_link_id?: string
}

export type GoogleAttachRow = {
  id: string
  client_id: string
  offer_revision_id: string
  engagement_id: string
  source_snapshot: Record<string, unknown>
  status: GoogleAttachStatus
  customer_id: string | null
  link_status: string | null
  destination_url: string | null
  plan: GoogleAttachPlan
  google_ids: GoogleAttachGoogleIds
  created_at: string
  updated_at: string
}

export type GoogleAttachMergeContext = {
  business: string
  suburb: string
  years: string
  phone: string
  destination: string
}

export type GoogleAdsConfigStatus = {
  configured: boolean
  missing: string[]
}
