import type { AdCreativeMetric, HomeAdGlance } from '@/lib/home-demo-data'

export type AdPlatform = 'meta' | 'google' | 'linkedin'

export type AdAccountStatus = 'connected' | 'error' | 'disconnected'

export type AdAccountRow = {
  id: string
  platform: AdPlatform
  external_account_id: string
  account_name: string | null
  currency: string | null
  status: AdAccountStatus
  access_token_enc: string | null
  refresh_token_enc: string | null
  token_expires_at: string | null
  meta: Record<string, unknown>
  last_synced_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export type AdAccountPublic = {
  id: string
  platform: AdPlatform
  externalAccountId: string
  accountName: string | null
  currency: string | null
  status: AdAccountStatus
  hasToken: boolean
  lastSyncedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
  meta: {
    leadValue?: number
    loginCustomerId?: string
  }
}

export type SyncedCreative = AdCreativeMetric & {
  leads: number
  impressions: number
  clicks: number
  periodStart?: string
  periodEnd?: string
}

export const AD_ACCOUNT_LIST_COLUMNS =
  'id,platform,external_account_id,account_name,currency,status,access_token_enc,refresh_token_enc,token_expires_at,meta,last_synced_at,last_error,created_at,updated_at'

export function platformLabel(platform: AdPlatform): 'Meta' | 'Google' | 'LinkedIn' {
  switch (platform) {
    case 'meta':
      return 'Meta'
    case 'google':
      return 'Google'
    case 'linkedin':
      return 'LinkedIn'
  }
}

export function projectAdAccount(row: AdAccountRow): AdAccountPublic {
  const meta = row.meta ?? {}
  return {
    id: row.id,
    platform: row.platform,
    externalAccountId: row.external_account_id,
    accountName: row.account_name,
    currency: row.currency,
    status: row.status,
    hasToken: Boolean(row.access_token_enc),
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    meta: {
      leadValue: typeof meta.lead_value === 'number' ? meta.lead_value : undefined,
      loginCustomerId:
        typeof meta.login_customer_id === 'string' ? meta.login_customer_id : undefined
    }
  }
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/,/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** Prefer lead / purchase conversion counts from Meta-style action arrays. */
export function extractConversionCount(
  actions: Array<Record<string, unknown>> | undefined | null
): number {
  if (!Array.isArray(actions)) return 0
  const preferred = [
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase',
    'lead',
    'onsite_web_lead',
    'offsite_conversion.fb_pixel_lead',
    'onsite_conversion.lead_grouped'
  ]
  for (const kind of preferred) {
    const hit = actions.find((a) => a.action_type === kind)
    if (hit) return num(hit.value)
  }
  return 0
}

export function extractPurchaseValue(
  actionValues: Array<Record<string, unknown>> | undefined | null
): number {
  if (!Array.isArray(actionValues)) return 0
  const preferred = [
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase',
    'initiate_checkout',
    'omni_initiated_checkout'
  ]
  for (const kind of preferred) {
    const hit = actionValues.find((a) => a.action_type === kind)
    if (hit) return num(hit.value)
  }
  return 0
}

export function classifyCreativeStatus(input: {
  spend: number
  ctr: number
  cpa: number | null
  roas: number
  leads: number
  impressions: number
}): AdCreativeMetric['status'] {
  const { spend, ctr, cpa, roas, leads, impressions } = input

  if (spend < 25 || impressions < 200) return 'learning'

  if (roas >= 2.5 || (leads >= 3 && cpa !== null && cpa > 0 && cpa <= 55)) {
    return 'winning'
  }

  if (ctr < 0.55 && spend >= 40) return 'fatigued'

  if (
    (spend >= 50 && leads === 0) ||
    (cpa !== null && cpa > 110) ||
    (ctr < 0.85 && spend >= 80 && leads <= 1)
  ) {
    return 'needs-review'
  }

  if (leads < 3 && spend < 120) return 'learning'

  return 'needs-review'
}

export function buildCreativeMetrics(input: {
  id: string
  name: string
  channel: AdCreativeMetric['channel']
  spend: number
  ctr: number
  impressions?: number
  clicks?: number
  leads?: number
  purchaseValue?: number
  leadValue?: number
  periodStart?: string
  periodEnd?: string
}): SyncedCreative {
  const spend = Math.max(0, num(input.spend))
  const ctr = Math.max(0, num(input.ctr))
  const impressions = Math.max(0, Math.round(num(input.impressions)))
  const clicks = Math.max(0, Math.round(num(input.clicks)))
  const leads = Math.max(0, Math.round(num(input.leads)))
  const purchaseValue = Math.max(0, num(input.purchaseValue))
  const leadValue =
    typeof input.leadValue === 'number' && input.leadValue > 0
      ? input.leadValue
      : Number(process.env.AD_DEFAULT_LEAD_VALUE || 200)

  const cpa = leads > 0 ? spend / leads : null
  const value = purchaseValue > 0 ? purchaseValue : leads * leadValue
  const roas = spend > 0 ? value / spend : 0
  const status = classifyCreativeStatus({ spend, ctr, cpa, roas, leads, impressions })

  return {
    id: input.id,
    name: input.name,
    channel: input.channel,
    status,
    spend: Math.round(spend * 100) / 100,
    ctr: Math.round(ctr * 100) / 100,
    cpa: cpa === null ? 0 : Math.round(cpa),
    roas: Math.round(roas * 10) / 10,
    leads,
    impressions,
    clicks,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd
  }
}

export function aggregateGlance(
  creatives: SyncedCreative[],
  opts: {
    spendToday: number
    spendYesterday: number
    roas7d: number
  }
): HomeAdGlance {
  const top = [...creatives].sort((a, b) => b.spend - a.spend).slice(0, 8)
  const needingReview = creatives.filter(
    (c) => c.status === 'needs-review' || c.status === 'fatigued'
  ).length

  const spendWindow = creatives.reduce((sum, c) => sum + c.spend, 0)
  const leadsWindow = creatives.reduce((sum, c) => sum + c.leads, 0)
  const valueWindow = creatives.reduce((sum, c) => sum + c.roas * c.spend, 0)
  const blendedRoas = spendWindow > 0 ? valueWindow / spendWindow : 0
  const blendedCpa = leadsWindow > 0 ? spendWindow / leadsWindow : 0

  const spendDelta =
    opts.spendYesterday > 0
      ? ((opts.spendToday - opts.spendYesterday) / opts.spendYesterday) * 100
      : opts.spendToday > 0
        ? 100
        : 0

  return {
    spendToday: Math.round(opts.spendToday),
    spendDelta: Math.round(spendDelta * 10) / 10,
    roas: Math.round(blendedRoas * 10) / 10,
    roasDelta: Math.round((blendedRoas - opts.roas7d) * 10) / 10,
    cpa: Math.round(blendedCpa),
    creativesNeedingReview: needingReview,
    creatives: top.map(({ leads: _l, impressions: _i, clicks: _c, periodStart: _ps, periodEnd: _pe, ...rest }) => rest)
  }
}

export function normalizeExternalAccountId(platform: AdPlatform, raw: string): string {
  const trimmed = raw.trim()
  if (platform === 'meta') {
    const digits = trimmed.replace(/^act_/i, '').replace(/\D/g, '')
    return digits ? `act_${digits}` : trimmed
  }
  if (platform === 'google') return trimmed.replace(/[-\s]/g, '')
  return trimmed.replace(/^urn:li:sponsoredAccount:/i, '')
}
