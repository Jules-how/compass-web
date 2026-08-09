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
  reply_count: number
  reply_count_unique: number
  completed_count: number
  total_opportunities: number
  bounced_count?: number
  unsubscribed_count?: number
}

/** Outbound hub campaign card — mapped from Instantly analytics (or demo fallback). */
export type OutboundBoardCampaign = {
  id: string
  name: string
  status: 'live' | 'launching' | 'paused' | 'completed'
  offer: string
  offerKey: string
  copyNotes: string
  vertical: string
  location: string
  leadCount: number
  sendCount: number
  remaining: number
  progress: number
  replyCount: number
  replyRate: number
  opportunities: number
  bouncedCount: number
  completedCount: number
  /** @deprecated Prefer replyCount / opportunities — kept for older demo rows. */
  positiveReplies: number
  /** @deprecated Prefer opportunities — kept for older demo rows. */
  meetings: number
  startedAt: string
  updatedAt: string
}

export type OutboundBoard = {
  live: OutboundBoardCampaign[]
  history: OutboundBoardCampaign[]
  liveCount: number
}

export type InstantlyAnalyticsOverview = {
  emails_sent_count: number
  reply_count: number
  reply_count_unique: number
  total_opportunities: number
  total_interested: number
  total_meeting_booked: number
  total_meeting_completed: number
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

export function mapInstantlyOutboundStatus(
  status: number
): OutboundBoardCampaign['status'] {
  if (status === INSTANTLY_CAMPAIGN_STATUS.completed) return 'completed'
  return mapInstantlyCampaignStatus(status)
}

export function campaignReplyRate(row: InstantlyCampaignAnalytics): number {
  const sent = Math.max(0, Number(row.emails_sent_count) || 0)
  if (sent <= 0) return 0
  const replies =
    Math.max(0, Number(row.reply_count_unique) || 0) ||
    Math.max(0, Number(row.reply_count) || 0)
  return Math.round((1000 * replies) / sent) / 10
}

export function mapInstantlyRowToOutboundCampaign(
  row: InstantlyCampaignAnalytics
): OutboundBoardCampaign {
  const leads = Math.max(0, Number(row.leads_count) || 0)
  const newContacted = Math.max(0, Number(row.new_leads_contacted_count) || 0)
  const contacted = Math.max(0, Number(row.contacted_count) || 0)
  const touched = newContacted > 0 ? newContacted : Math.min(contacted, leads)
  const sendCount = Math.max(0, Number(row.emails_sent_count) || 0)
  const replyCount =
    Math.max(0, Number(row.reply_count_unique) || 0) ||
    Math.max(0, Number(row.reply_count) || 0)
  const opportunities = Math.max(0, Number(row.total_opportunities) || 0)
  const remaining = Math.max(0, leads - touched)

  return {
    id: row.campaign_id,
    name: row.campaign_name || 'Untitled campaign',
    status: mapInstantlyOutboundStatus(row.campaign_status),
    offer: '',
    offerKey: '',
    copyNotes: '',
    vertical: '',
    location: '',
    leadCount: leads,
    sendCount,
    remaining,
    progress: campaignProgress(row),
    replyCount,
    replyRate: campaignReplyRate(row),
    opportunities,
    bouncedCount: Math.max(0, Number(row.bounced_count) || 0),
    completedCount: Math.max(0, Number(row.completed_count) || 0),
    positiveReplies: opportunities,
    meetings: opportunities,
    startedAt: '',
    updatedAt: ''
  }
}

function outboundStatusRank(status: OutboundBoardCampaign['status']): number {
  switch (status) {
    case 'live':
      return 0
    case 'launching':
      return 1
    case 'paused':
      return 2
    default:
      return 3
  }
}

export function buildOutboundBoard(rows: InstantlyCampaignAnalytics[]): OutboundBoard {
  const mapped = rows.map(mapInstantlyRowToOutboundCampaign)
  const live = mapped
    .filter((c) => c.status === 'live' || c.status === 'launching' || c.status === 'paused')
    .sort((a, b) => {
      const byStatus = outboundStatusRank(a.status) - outboundStatusRank(b.status)
      if (byStatus !== 0) return byStatus
      return b.sendCount - a.sendCount
    })
  const history = mapped
    .filter((c) => c.status === 'completed')
    .sort((a, b) => b.sendCount - a.sendCount)

  return {
    live,
    history,
    liveCount: live.filter((c) => c.status === 'live').length
  }
}

const OUTBOUND_BOARD_CACHE_TTL_MS = 60_000

type OutboundBoardCacheEntry = {
  key: string
  value: OutboundBoard
  updatedAt: number
  promise?: Promise<OutboundBoard>
}

let outboundBoardCache: OutboundBoardCacheEntry | null = null

/** Clear the process-local outbound board cache (tests / forced refresh). */
export function clearOutboundBoardCache() {
  outboundBoardCache = null
}

export async function loadOutboundBoardFromInstantly(
  apiKey = getInstantlyApiKey()
): Promise<OutboundBoard> {
  if (!apiKey) {
    throw new InstantlyApiError('INSTANTLY_API_KEY is not configured', 503)
  }

  const timeZone = getInstantlyTimezone()
  const today = calendarDateInTimezone(new Date(), timeZone)
  const cacheKey = `outbound:${today}`

  const cached = outboundBoardCache
  if (
    cached &&
    cached.key === cacheKey &&
    Date.now() - cached.updatedAt < OUTBOUND_BOARD_CACHE_TTL_MS &&
    !cached.promise
  ) {
    return cached.value
  }
  if (cached?.promise && cached.key === cacheKey) {
    return cached.promise
  }

  const promise = (async () => {
    const rows = await fetchInstantlyCampaignAnalytics(apiKey)
    return buildOutboundBoard(rows)
  })()

  outboundBoardCache = {
    key: cacheKey,
    value: cached?.value ?? { live: [], history: [], liveCount: 0 },
    updatedAt: cached?.updatedAt ?? 0,
    promise
  }

  try {
    const value = await promise
    outboundBoardCache = { key: cacheKey, value, updatedAt: Date.now() }
    return value
  } catch (err) {
    if (outboundBoardCache?.promise === promise) {
      delete outboundBoardCache.promise
    }
    throw err
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
  campaignId?: string
): Promise<InstantlyCampaignAnalytics[]> {
  const qs = campaignId?.trim()
    ? `?${new URLSearchParams({ id: campaignId.trim() })}`
    : ''
  const rows = await instantlyFetch<InstantlyCampaignAnalytics[]>(
    `/campaigns/analytics${qs}`,
    apiKey
  )
  return Array.isArray(rows) ? rows : []
}

/** UI payload for the sequence editor Analytics tab. */
export type SequenceCampaignAnalytics = {
  campaignId: string
  campaignName: string
  status: InstantlyUiCampaignStatus
  leads: number
  contacted: number
  sent: number
  replies: number
  opportunities: number
  completed: number
  remaining: number
  progress: number
  replyRate: number
}

export function buildSequenceCampaignAnalytics(
  row: InstantlyCampaignAnalytics
): SequenceCampaignAnalytics {
  const leads = Math.max(0, Number(row.leads_count) || 0)
  const contacted = Math.max(0, Number(row.contacted_count) || 0)
  const sent = Math.max(0, Number(row.emails_sent_count) || 0)
  const replies =
    Math.max(0, Number(row.reply_count_unique) || 0) ||
    Math.max(0, Number(row.reply_count) || 0)
  const opportunities = Math.max(0, Number(row.total_opportunities) || 0)
  const completed = Math.max(0, Number(row.completed_count) || 0)
  const progress = campaignProgress(row)
  const remaining = Math.max(0, leads - Math.min(contacted, leads))
  const replyRate = sent > 0 ? Math.round((1000 * replies) / sent) / 10 : 0

  return {
    campaignId: row.campaign_id,
    campaignName: row.campaign_name || 'Untitled campaign',
    status: mapInstantlyCampaignStatus(row.campaign_status),
    leads,
    contacted,
    sent,
    replies,
    opportunities,
    completed,
    remaining,
    progress,
    replyRate
  }
}

export function findCampaignAnalytics(
  rows: InstantlyCampaignAnalytics[],
  campaignId: string
): InstantlyCampaignAnalytics | null {
  const id = campaignId.trim()
  if (!id) return null
  return rows.find((row) => row.campaign_id === id) ?? null
}

const SEQUENCE_ANALYTICS_CACHE_TTL_MS = 60_000

type SequenceAnalyticsCacheEntry = {
  key: string
  value: SequenceCampaignAnalytics
  updatedAt: number
  promise?: Promise<SequenceCampaignAnalytics>
}

const sequenceAnalyticsCache = new Map<string, SequenceAnalyticsCacheEntry>()

/** Clear process-local per-campaign analytics cache (tests / forced refresh). */
export function clearSequenceCampaignAnalyticsCache() {
  sequenceAnalyticsCache.clear()
}

/**
 * Demo metrics when INSTANTLY_API_KEY is unset — keyed so the same Instantly id
 * always returns a stable shape for the editor Analytics tab.
 */
export function buildDemoSequenceCampaignAnalytics(
  campaignId: string
): SequenceCampaignAnalytics {
  const id = campaignId.trim() || 'demo-campaign'
  // Deterministic-ish demo numbers from the id so the UI isn't empty in local/dev.
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  const leads = 800 + (hash % 1600)
  const progress = 35 + (hash % 50)
  const contacted = Math.round((leads * progress) / 100)
  const sent = Math.round(contacted * (1.4 + (hash % 40) / 100))
  const replies = Math.max(1, Math.round(sent * (0.02 + (hash % 30) / 1000)))
  const opportunities = Math.max(0, Math.round(replies * 0.25))
  const completed = Math.round(leads * (progress / 100) * 0.4)
  return {
    campaignId: id,
    campaignName: 'Demo Instantly campaign',
    status: 'live',
    leads,
    contacted,
    sent,
    replies,
    opportunities,
    completed,
    remaining: Math.max(0, leads - contacted),
    progress,
    replyRate: sent > 0 ? Math.round((1000 * replies) / sent) / 10 : 0
  }
}

export async function loadSequenceCampaignAnalytics(
  campaignId: string,
  apiKey = getInstantlyApiKey()
): Promise<SequenceCampaignAnalytics> {
  const id = campaignId.trim()
  if (!id) {
    throw new InstantlyApiError('campaign id is required', 400)
  }
  if (!apiKey) {
    throw new InstantlyApiError('INSTANTLY_API_KEY is not configured', 503)
  }

  const cached = sequenceAnalyticsCache.get(id)
  if (
    cached &&
    Date.now() - cached.updatedAt < SEQUENCE_ANALYTICS_CACHE_TTL_MS &&
    !cached.promise
  ) {
    return cached.value
  }
  if (cached?.promise) {
    return cached.promise
  }

  const promise = (async () => {
    let rows = await fetchInstantlyCampaignAnalytics(apiKey, id)
    let row = findCampaignAnalytics(rows, id)
    // Some Instantly workspaces ignore the `id` filter — fall back to full list.
    if (!row) {
      rows = await fetchInstantlyCampaignAnalytics(apiKey)
      row = findCampaignAnalytics(rows, id)
    }
    if (!row) {
      throw new InstantlyApiError(`Campaign ${id} not found in Instantly analytics`, 404)
    }
    return buildSequenceCampaignAnalytics(row)
  })()

  sequenceAnalyticsCache.set(id, {
    key: id,
    value:
      cached?.value ??
      ({
        campaignId: id,
        campaignName: '',
        status: 'paused',
        leads: 0,
        contacted: 0,
        sent: 0,
        replies: 0,
        opportunities: 0,
        completed: 0,
        remaining: 0,
        progress: 0,
        replyRate: 0
      } satisfies SequenceCampaignAnalytics),
    updatedAt: cached?.updatedAt ?? 0,
    promise
  })

  try {
    const value = await promise
    sequenceAnalyticsCache.set(id, { key: id, value, updatedAt: Date.now() })
    return value
  } catch (err) {
    const entry = sequenceAnalyticsCache.get(id)
    if (entry?.promise === promise) {
      delete entry.promise
    }
    throw err
  }
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
