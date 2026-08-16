import {
  calendarDateInTimezone,
  campaignProgress,
  fetchInstantlyAnalyticsOverview,
  fetchInstantlyCampaignAnalytics,
  fetchInstantlyDailyCampaignAnalytics,
  getInstantlyApiKey,
  getInstantlyTimezone,
  InstantlyApiError,
  INSTANTLY_CAMPAIGN_STATUS,
  mapInstantlyCampaignStatus,
  rollingWindowDates,
  selectHomeCampaigns,
  type InstantlyAnalyticsOverview,
  type InstantlyCampaignAnalytics,
  type InstantlyDailyAnalytics
} from '@/lib/instantly'
import {
  SALES_OVERVIEW_DEMO,
  type SalesCampaignRef,
  type SalesDeal,
  type SalesOverviewModel,
  type SalesSeriesPoint
} from '@/lib/sales-demo-data'

const SALES_OVERVIEW_CACHE_TTL_MS = 60_000
const SALES_CAMPAIGN_LIMIT = 8

export type SalesOverviewCrmDealRow = {
  id?: string | null
  name?: string | null
  company?: string | null
  outbound_status?: string | null
  instantly_campaign_name?: string | null
  updated_at?: string | null
  mirrored_at?: string | null
}

type SalesOverviewCacheEntry = {
  key: string
  value: SalesOverviewModel
  updatedAt: number
  promise?: Promise<SalesOverviewModel>
}

let salesOverviewCache: SalesOverviewCacheEntry | null = null

/** Clear the process-local sales overview cache (tests / forced refresh). */
export function clearSalesOverviewCache() {
  salesOverviewCache = null
}

function pctDelta(current: number, prior: number): number {
  if (prior <= 0) return current > 0 ? 100 : 0
  return Math.round(((current - prior) / prior) * 1000) / 10
}

function ratePct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round((1000 * numerator) / denominator) / 10
}

export function mapInstantlySalesCampaignStatus(
  status: number
): SalesCampaignRef['status'] {
  if (status === INSTANTLY_CAMPAIGN_STATUS.completed) return 'completed'
  return mapInstantlyCampaignStatus(status)
}

/** Split Instantly campaign names like `Brand | Offer | Wave` into offer/list chips. */
export function splitCampaignMeta(name: string): { offer: string; list: string } {
  const parts = name
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return { list: parts[0], offer: parts.slice(1).join(' · ') }
  }
  return { list: 'Instantly', offer: name.trim() || 'Outbound' }
}

export function formatSeriesDateLabel(isoDate: string, timeZone: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  const utc = new Date(Date.UTC(year, month - 1, day, 12))
  return utc.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })
}

export function buildSalesSeriesFromDaily(
  rows: InstantlyDailyAnalytics[],
  timeZone = getInstantlyTimezone()
): SalesSeriesPoint[] {
  return [...rows]
    .filter((row) => typeof row.date === 'string' && row.date.length >= 8)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date: formatSeriesDateLabel(row.date, timeZone),
      sent: Math.max(0, Math.round(Number(row.sent) || 0)),
      opens: Math.max(
        0,
        Math.round(Number(row.unique_opened) || Number(row.opened) || 0)
      ),
      replies: Math.max(
        0,
        Math.round(Number(row.unique_replies) || Number(row.replies) || 0)
      )
    }))
}

function mapSalesCampaign(row: InstantlyCampaignAnalytics): SalesCampaignRef {
  const meta = splitCampaignMeta(row.campaign_name || 'Campaign')
  return {
    id: row.campaign_id,
    name: row.campaign_name || 'Untitled campaign',
    status: mapInstantlySalesCampaignStatus(row.campaign_status),
    offer: meta.offer,
    list: meta.list,
    sent: Math.max(0, Math.round(Number(row.emails_sent_count) || 0)),
    replies: Math.max(
      0,
      Math.round(Number(row.reply_count_unique) || Number(row.reply_count) || 0)
    ),
    meetings: Math.max(0, Math.round(Number(row.total_opportunities) || 0)),
    expectedRevenue: Math.max(0, Math.round(Number(row.total_opportunity_value) || 0)),
    progress: campaignProgress(row)
  }
}

export function mapCrmOutboundToDealStage(
  status: string | null | undefined
): SalesDeal['stage'] {
  const s = (status ?? '').trim().toLowerCase()
  if (s === 'converted' || s === 'closed' || s === 'won') return 'won'
  if (s === 'booked' || s === 'meeting_booked' || s === 'meeting_completed') return 'meeting'
  if (s === 'proposal') return 'proposal'
  return 'qualified'
}

export function buildDealsFromCrmRows(rows: SalesOverviewCrmDealRow[]): SalesDeal[] {
  return rows.slice(0, 8).map((row, index) => {
    const company =
      (row.company ?? '').trim() ||
      (row.name ?? '').trim() ||
      `Opportunity ${index + 1}`
    const name =
      (row.name ?? '').trim() && (row.company ?? '').trim()
        ? (row.name as string).trim()
        : (row.instantly_campaign_name ?? '').trim() || 'Instantly reply'
    return {
      id: row.id?.trim() || `crm-${index}`,
      name,
      company,
      stage: mapCrmOutboundToDealStage(row.outbound_status),
      value: null,
      offer: (row.instantly_campaign_name ?? '').trim() || 'Outbound',
      updatedAt: (row.updated_at || row.mirrored_at || '').slice(0, 10)
    }
  })
}

export function buildDealsFromCampaignOpportunities(
  rows: InstantlyCampaignAnalytics[]
): SalesDeal[] {
  return [...rows]
    .filter((row) => (Number(row.total_opportunities) || 0) > 0)
    .sort(
      (a, b) =>
        (Number(b.total_opportunity_value) || 0) - (Number(a.total_opportunity_value) || 0) ||
        (Number(b.total_opportunities) || 0) - (Number(a.total_opportunities) || 0)
    )
    .slice(0, 8)
    .map((row) => {
      const meta = splitCampaignMeta(row.campaign_name || 'Campaign')
      const opps = Math.max(0, Math.round(Number(row.total_opportunities) || 0))
      return {
        id: `opp-${row.campaign_id}`,
        name: `${opps} opportunit${opps === 1 ? 'y' : 'ies'}`,
        company: row.campaign_name || 'Campaign',
        stage: mapInstantlySalesCampaignStatus(row.campaign_status) === 'completed' ? 'won' : 'qualified',
        value: Math.max(0, Math.round(Number(row.total_opportunity_value) || 0)),
        offer: meta.offer,
        updatedAt: ''
      } satisfies SalesDeal
    })
}

export function buildSalesOverviewModel(input: {
  rolling30d: InstantlyAnalyticsOverview
  prior30d: InstantlyAnalyticsOverview
  campaigns: InstantlyCampaignAnalytics[]
  daily: InstantlyDailyAnalytics[]
  crmDeals?: SalesOverviewCrmDealRow[]
  timeZone?: string
}): SalesOverviewModel {
  const timeZone = input.timeZone || getInstantlyTimezone()
  const sent30 = Math.max(0, Math.round(Number(input.rolling30d.emails_sent_count) || 0))
  const sentPrior = Math.max(0, Math.round(Number(input.prior30d.emails_sent_count) || 0))
  const replies30 = Math.max(
    0,
    Math.round(
      Number(input.rolling30d.reply_count_unique) || Number(input.rolling30d.reply_count) || 0
    )
  )
  const bounced = Math.max(0, Math.round(Number(input.rolling30d.bounced_count) || 0))
  const contacted = Math.max(
    0,
    Math.round(Number(input.rolling30d.contacted_count) || sent30)
  )
  const interested = Math.max(0, Math.round(Number(input.rolling30d.total_interested) || 0))
  const meetings = Math.max(
    0,
    Math.round(
      Number(input.rolling30d.total_meeting_booked) ||
        Number(input.rolling30d.total_meeting_completed) ||
        0
    )
  )
  const opportunityValue = Math.max(
    0,
    Math.round(Number(input.rolling30d.total_opportunity_value) || 0)
  )
  const priorOpportunityValue = Math.max(
    0,
    Math.round(Number(input.prior30d.total_opportunity_value) || 0)
  )
  const positive = interested + meetings
  const delivered = Math.max(0, sent30 - bounced)

  const campaigns = selectHomeCampaigns(input.campaigns, SALES_CAMPAIGN_LIMIT).map(
    mapSalesCampaign
  )

  const liveCampaigns = input.campaigns.filter(
    (row) =>
      row.campaign_status === INSTANTLY_CAMPAIGN_STATUS.active ||
      row.campaign_status === INSTANTLY_CAMPAIGN_STATUS.runningSubsequences
  )
  const liveOffers = new Set(
    liveCampaigns.map((row) => splitCampaignMeta(row.campaign_name || '').offer)
  ).size

  const contactsRemaining = liveCampaigns.reduce((sum, row) => {
    const leads = Math.max(0, Number(row.leads_count) || 0)
    const contactedCount = Math.max(0, Number(row.contacted_count) || 0)
    return sum + Math.max(0, leads - Math.min(contactedCount, leads))
  }, 0)

  const crmDeals = buildDealsFromCrmRows(input.crmDeals ?? [])
  const deals =
    crmDeals.length > 0 ? crmDeals : buildDealsFromCampaignOpportunities(input.campaigns)

  return {
    source: (input.crmDeals?.length ?? 0) > 0 ? 'mixed' : 'instantly',
    kpis: {
      emailsSent: sent30,
      emailsSentDelta: pctDelta(sent30, sentPrior),
      liveOffers: liveOffers || liveCampaigns.length,
      replies: replies30,
      replyRate: ratePct(replies30, sent30),
      expectedRevenue: opportunityValue,
      expectedRevenueDelta: pctDelta(opportunityValue, priorOpportunityValue),
      meetingsBooked: meetings,
      bounceRate: ratePct(bounced, contacted || sent30),
      positiveReplyRate: ratePct(positive, delivered),
      contactsRemaining
    },
    campaigns,
    series: buildSalesSeriesFromDaily(input.daily, timeZone),
    deals,
    offers: Array.from(new Set(campaigns.map((c) => c.offer).filter(Boolean))),
    lists: Array.from(new Set(campaigns.map((c) => c.list).filter(Boolean)))
  }
}

export async function loadSalesOverviewFromInstantly(
  apiKey = getInstantlyApiKey(),
  options?: { crmDeals?: SalesOverviewCrmDealRow[] }
): Promise<SalesOverviewModel> {
  if (!apiKey) {
    throw new InstantlyApiError('INSTANTLY_API_KEY is not configured', 503)
  }

  const timeZone = getInstantlyTimezone()
  const now = new Date()
  const window30 = rollingWindowDates(30, timeZone, now)
  const priorEndMs = now.getTime() - 30 * 86_400_000
  const priorEnd = calendarDateInTimezone(new Date(priorEndMs), timeZone)
  const priorStart = calendarDateInTimezone(new Date(priorEndMs - 30 * 86_400_000), timeZone)
  const yearStart = `${calendarDateInTimezone(now, timeZone).slice(0, 4)}-01-01`
  const end = window30.end
  // Load enough daily points for 90d / YTD chart ranges.
  const window90Start = calendarDateInTimezone(new Date(now.getTime() - 90 * 86_400_000), timeZone)
  const dailyStart = yearStart < window90Start ? yearStart : window90Start

  const cacheKey = `${end}:${window30.start}:${priorStart}:${dailyStart}`
  const cached = salesOverviewCache
  if (
    cached &&
    cached.key === cacheKey &&
    Date.now() - cached.updatedAt < SALES_OVERVIEW_CACHE_TTL_MS &&
    !cached.promise
  ) {
    if (options?.crmDeals) {
      return {
        ...cached.value,
        deals:
          buildDealsFromCrmRows(options.crmDeals).length > 0
            ? buildDealsFromCrmRows(options.crmDeals)
            : cached.value.deals,
        source: (options.crmDeals?.length ?? 0) > 0 ? 'mixed' : cached.value.source
      }
    }
    return cached.value
  }
  if (cached?.promise && cached.key === cacheKey && !options?.crmDeals) {
    return cached.promise
  }

  const promise = (async () => {
    const [rolling30d, prior30d, campaigns, daily] = await Promise.all([
      fetchInstantlyAnalyticsOverview(apiKey, window30.start, window30.end),
      fetchInstantlyAnalyticsOverview(apiKey, priorStart, priorEnd),
      fetchInstantlyCampaignAnalytics(apiKey),
      fetchInstantlyDailyCampaignAnalytics(apiKey, dailyStart, end)
    ])

    return buildSalesOverviewModel({
      rolling30d,
      prior30d,
      campaigns,
      daily,
      crmDeals: options?.crmDeals,
      timeZone
    })
  })()

  salesOverviewCache = {
    key: cacheKey,
    value: cached?.value ?? { ...SALES_OVERVIEW_DEMO, source: 'demo' },
    updatedAt: cached?.updatedAt ?? 0,
    promise
  }

  try {
    const value = await promise
    salesOverviewCache = { key: cacheKey, value, updatedAt: Date.now() }
    return value
  } catch (err) {
    if (salesOverviewCache?.promise === promise) {
      delete salesOverviewCache.promise
    }
    throw err
  }
}
