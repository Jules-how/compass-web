import type { ColdEmailGlance } from '@/lib/home-demo-data'

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v2'
const DEFAULT_TIMEZONE = 'Australia/Melbourne'
const HOME_CAMPAIGN_LIMIT = 5

/** Instantly campaign status codes (API v2). */
export const INSTANTLY_CAMPAIGN_STATUS = {
  draft: 0,
  active: 1,
  paused: 2,
  completed: 3,
  runningSubsequences: 4,
  accountsUnhealthy: -1,
  bounceProtect: -2,
  accountSuspended: -99
} as const

export type InstantlyUiCampaignStatus = 'live' | 'launching' | 'paused'

export type InstantlyCampaignAnalytics = {
  campaign_id: string
  campaign_name: string
  campaign_status: number
  leads_count: number
  contacted_count: number
  new_leads_contacted_count?: number
  emails_sent_count: number
  open_count?: number
  open_count_unique?: number
  reply_count: number
  reply_count_unique: number
  bounced_count?: number
  completed_count: number
  total_opportunities: number
  total_opportunity_value?: number
}

export type InstantlyAnalyticsOverview = {
  emails_sent_count: number
  open_count?: number
  open_count_unique?: number
  reply_count: number
  reply_count_unique: number
  bounced_count?: number
  contacted_count?: number
  new_leads_contacted_count?: number
  total_opportunities: number
  total_opportunity_value?: number
  total_interested: number
  total_meeting_booked: number
  total_meeting_completed: number
  total_closed?: number
}

export type InstantlyDailyAnalytics = {
  date: string
  sent: number
  contacted?: number
  new_leads_contacted?: number
  opened?: number
  unique_opened?: number
  replies?: number
  unique_replies?: number
  opportunities?: number
  unique_opportunities?: number
}

export class InstantlyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'InstantlyApiError'
  }
}

export function getInstantlyApiKey(): string | null {
  const key = process.env.INSTANTLY_API_KEY?.trim()
  return key || null
}

export function getInstantlyTimezone(): string {
  return process.env.INSTANTLY_TIMEZONE?.trim() || DEFAULT_TIMEZONE
}

/** Calendar date `YYYY-MM-DD` in the Instantly workspace timezone. */
export function calendarDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

export function rollingWindowDates(
  days: number,
  timeZone = getInstantlyTimezone(),
  now = new Date()
): { start: string; end: string } {
  const end = calendarDateInTimezone(now, timeZone)
  const startMs = now.getTime() - days * 86_400_000
  const start = calendarDateInTimezone(new Date(startMs), timeZone)
  return { start, end }
}

export function mapInstantlyCampaignStatus(status: number): InstantlyUiCampaignStatus {
  switch (status) {
    case INSTANTLY_CAMPAIGN_STATUS.active:
    case INSTANTLY_CAMPAIGN_STATUS.runningSubsequences:
      return 'live'
    case INSTANTLY_CAMPAIGN_STATUS.draft:
      return 'launching'
    default:
      return 'paused'
  }
}

export function campaignProgress(row: InstantlyCampaignAnalytics): number {
  const leads = Math.max(0, Number(row.leads_count) || 0)
  if (leads <= 0) return 0
  const newContacted = Math.max(0, Number(row.new_leads_contacted_count) || 0)
  const contacted = Math.max(0, Number(row.contacted_count) || 0)
  // Prefer unique new leads contacted (list throughput). Cap contacted because
  // Instantly can report multi-touch contacted counts above leads_count.
  const numerator = newContacted > 0 ? newContacted : Math.min(contacted, leads)
  return Math.min(100, Math.round((100 * numerator) / leads))
}

function statusRank(status: number): number {
  switch (status) {
    case INSTANTLY_CAMPAIGN_STATUS.active:
    case INSTANTLY_CAMPAIGN_STATUS.runningSubsequences:
      return 0
    case INSTANTLY_CAMPAIGN_STATUS.draft:
      return 1
    case INSTANTLY_CAMPAIGN_STATUS.paused:
    case INSTANTLY_CAMPAIGN_STATUS.accountsUnhealthy:
    case INSTANTLY_CAMPAIGN_STATUS.bounceProtect:
      return 2
    default:
      return 3
  }
}

export function selectHomeCampaigns(
  rows: InstantlyCampaignAnalytics[],
  limit = HOME_CAMPAIGN_LIMIT
): InstantlyCampaignAnalytics[] {
  const actionable = rows.filter(
    (row) => row.campaign_status !== INSTANTLY_CAMPAIGN_STATUS.completed
  )
  const pool = actionable.length > 0 ? actionable : rows
  return [...pool]
    .sort((a, b) => {
      const byStatus = statusRank(a.campaign_status) - statusRank(b.campaign_status)
      if (byStatus !== 0) return byStatus
      return (b.emails_sent_count || 0) - (a.emails_sent_count || 0)
    })
    .slice(0, limit)
}

export function buildColdEmailGlance(input: {
  today: InstantlyAnalyticsOverview
  rolling30d: InstantlyAnalyticsOverview
  repliesWaiting: number
  campaigns: InstantlyCampaignAnalytics[]
}): ColdEmailGlance {
  const sent30 = Number(input.rolling30d.emails_sent_count) || 0
  const replies30 = Number(input.rolling30d.reply_count_unique) || 0
  const replyRate = sent30 > 0 ? Math.round((1000 * replies30) / sent30) / 10 : 0

  // Prefer Instantly's meeting-booked status; fall back to interested/opportunities
  // when the workspace tracks outcomes there instead.
  const meetingsToday =
    Number(input.today.total_meeting_booked) ||
    Number(input.today.total_interested) ||
    Number(input.today.total_opportunities) ||
    0

  return {
    emailsSentToday: Number(input.today.emails_sent_count) || 0,
    repliesWaiting: Math.max(0, Math.round(Number(input.repliesWaiting) || 0)),
    meetingsBooked: meetingsToday,
    replyRate,
    campaigns: selectHomeCampaigns(input.campaigns).map((row) => ({
      id: row.campaign_id,
      name: row.campaign_name,
      status: mapInstantlyCampaignStatus(row.campaign_status),
      sent: Number(row.emails_sent_count) || 0,
      replies: Number(row.reply_count_unique) || Number(row.reply_count) || 0,
      meetings: Number(row.total_opportunities) || 0,
      progress: campaignProgress(row)
    }))
  }
}

async function instantlyFetch<T>(
  path: string,
  apiKey: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${INSTANTLY_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {})
    },
    cache: 'no-store'
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new InstantlyApiError(
      detail || `Instantly request failed (${res.status})`,
      res.status
    )
  }

  return (await res.json()) as T
}

export async function fetchInstantlyAnalyticsOverview(
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<InstantlyAnalyticsOverview> {
  const qs = new URLSearchParams({ start_date: startDate, end_date: endDate })
  return instantlyFetch<InstantlyAnalyticsOverview>(
    `/campaigns/analytics/overview?${qs}`,
    apiKey
  )
}

export async function fetchInstantlyCampaignAnalytics(
  apiKey: string,
  options?: { startDate?: string; endDate?: string }
): Promise<InstantlyCampaignAnalytics[]> {
  const qs = new URLSearchParams()
  if (options?.startDate) qs.set('start_date', options.startDate)
  if (options?.endDate) qs.set('end_date', options.endDate)
  const suffix = qs.size > 0 ? `?${qs}` : ''
  const rows = await instantlyFetch<InstantlyCampaignAnalytics[]>(
    `/campaigns/analytics${suffix}`,
    apiKey
  )
  return Array.isArray(rows) ? rows : []
}

export async function fetchInstantlyDailyCampaignAnalytics(
  apiKey: string,
  startDate: string,
  endDate: string,
  campaignId?: string
): Promise<InstantlyDailyAnalytics[]> {
  const qs = new URLSearchParams({ start_date: startDate, end_date: endDate })
  if (campaignId) qs.set('campaign_id', campaignId)
  const rows = await instantlyFetch<InstantlyDailyAnalytics[]>(
    `/campaigns/analytics/daily?${qs}`,
    apiKey
  )
  return Array.isArray(rows) ? rows : []
}

export async function fetchInstantlyUnreadCount(apiKey: string): Promise<number> {
  const body = await instantlyFetch<{ count?: number }>('/emails/unread/count', apiKey)
  return Math.max(0, Math.round(Number(body.count) || 0))
}

const COLD_EMAIL_CACHE_TTL_MS = 60_000

type ColdEmailCacheEntry = {
  key: string
  value: ColdEmailGlance
  updatedAt: number
  promise?: Promise<ColdEmailGlance>
}

let coldEmailCache: ColdEmailCacheEntry | null = null

/** Clear the process-local Instantly glance cache (tests / forced refresh). */
export function clearColdEmailGlanceCache() {
  coldEmailCache = null
}

export async function loadColdEmailGlanceFromInstantly(
  apiKey = getInstantlyApiKey()
): Promise<ColdEmailGlance> {
  if (!apiKey) {
    throw new InstantlyApiError('INSTANTLY_API_KEY is not configured', 503)
  }

  const timeZone = getInstantlyTimezone()
  const today = calendarDateInTimezone(new Date(), timeZone)
  const window30 = rollingWindowDates(30, timeZone)
  // Key omits the full secret — date window is enough within one process.
  const cacheKey = `${today}:${window30.start}:${window30.end}`

  const cached = coldEmailCache
  if (
    cached &&
    cached.key === cacheKey &&
    Date.now() - cached.updatedAt < COLD_EMAIL_CACHE_TTL_MS &&
    !cached.promise
  ) {
    return cached.value
  }
  if (cached?.promise && cached.key === cacheKey) {
    return cached.promise
  }

  const promise = (async () => {
    const [todayOverview, rolling30d, unread, campaigns] = await Promise.all([
      fetchInstantlyAnalyticsOverview(apiKey, today, today),
      fetchInstantlyAnalyticsOverview(apiKey, window30.start, window30.end),
      fetchInstantlyUnreadCount(apiKey),
      fetchInstantlyCampaignAnalytics(apiKey)
    ])

    return buildColdEmailGlance({
      today: todayOverview,
      rolling30d,
      repliesWaiting: unread,
      campaigns
    })
  })()

  coldEmailCache = {
    key: cacheKey,
    value: cached?.value ?? {
      emailsSentToday: 0,
      repliesWaiting: 0,
      meetingsBooked: 0,
      replyRate: 0,
      campaigns: []
    },
    updatedAt: cached?.updatedAt ?? 0,
    promise
  }

  try {
    const value = await promise
    coldEmailCache = { key: cacheKey, value, updatedAt: Date.now() }
    return value
  } catch (err) {
    if (coldEmailCache?.promise === promise) {
      delete coldEmailCache.promise
    }
    throw err
  }
}
