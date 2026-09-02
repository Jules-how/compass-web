import type { CompassCampaign, OfferWaveColumnId, OfferWaveMetrics } from '@/lib/campaigns'
import { dateOnlyInZone, offerWaveColumn } from '@/lib/campaigns'
import type { OutboundBoardCampaign } from '@/lib/instantly'

export const WAVE_ACTION_KINDS = [
  'volume',
  'copy',
  'personalization',
  'research',
  'offer',
  'inboxes',
  'product',
  'city',
  'demographic',
  'other'
] as const
export type WaveActionKind = (typeof WAVE_ACTION_KINDS)[number]

export const WAVE_ACTION_STATUSES = ['queued', 'doing', 'done'] as const
export type WaveActionStatus = (typeof WAVE_ACTION_STATUSES)[number]

export const WAVE_ACTION_SOURCES = ['agent', 'jules'] as const
export type WaveActionSource = (typeof WAVE_ACTION_SOURCES)[number]

export type WaveAction = {
  id: string
  title: string
  kind: WaveActionKind
  detail: string | null
  source: WaveActionSource
  status: WaveActionStatus
  week_start: string | null
  campaign_id: string | null
  created_at: string
  updated_at: string
}

export type WaveBrief = {
  id: string
  generated_at: string
  recommendation: string | null
  scan: Record<string, unknown>
  created_at: string
}

export type WaveSuggestionKind = 'load_more' | 'pause_inspect' | 'kill' | 'new_list'

export type WaveSuggestion = {
  kind: WaveSuggestionKind
  campaignId: string | null
  campaignName: string
  title: string
  detail: string
}

export function normalizeWaveActionKind(value: string | undefined | null): WaveActionKind {
  if (value && (WAVE_ACTION_KINDS as readonly string[]).includes(value)) {
    return value as WaveActionKind
  }
  return 'other'
}

export function normalizeWaveActionStatus(value: string | undefined | null): WaveActionStatus {
  if (value && (WAVE_ACTION_STATUSES as readonly string[]).includes(value)) {
    return value as WaveActionStatus
  }
  return 'queued'
}

export function normalizeWaveActionSource(value: string | undefined | null): WaveActionSource {
  return value === 'jules' ? 'jules' : 'agent'
}

export function sydneyDateOnly(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now)
}

export function mondayOfSydneyWeek(now = new Date()): string {
  const dateOnly = sydneyDateOnly(now)
  const d = new Date(`${dateOnly}T00:00:00Z`)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

export function upcomingSendForecast(board: {
  live: Array<Pick<OutboundBoardCampaign, 'remaining' | 'status' | 'sendCount'>>
  history?: Array<Pick<OutboundBoardCampaign, 'remaining'>>
}): { remaining: number; liveCampaigns: number } {
  const remaining = board.live.reduce((sum, row) => sum + Math.max(0, row.remaining || 0), 0)
  const liveCampaigns = board.live.filter((row) => row.status === 'live').length
  return { remaining, liveCampaigns }
}

export function suggestWaveMoves(input: {
  campaigns: Array<
    Pick<CompassCampaign, 'id' | 'name' | 'status' | 'wave_lane' | 'instantly_campaign_id'>
  >
  instantly: Array<
    Pick<
      OutboundBoardCampaign,
      'id' | 'name' | 'status' | 'sendCount' | 'replyCount' | 'replyRate' | 'remaining' | 'positiveReplies'
    >
  >
}): WaveSuggestion[] {
  const suggestions: WaveSuggestion[] = []
  const byInstantlyId = new Map(input.campaigns.map((row) => [row.instantly_campaign_id || '', row]))

  for (const row of input.instantly) {
    const bound = byInstantlyId.get(row.id)
    const name = bound?.name || row.name
    const campaignId = bound?.id ?? null
    const sends = Math.max(0, row.sendCount || 0)
    const replies = Math.max(0, row.replyCount || 0)
    const rate = sends > 0 ? replies / sends : 0
    const remaining = Math.max(0, row.remaining || 0)
    const live = row.status === 'live'

    if (sends >= 1000 && replies === 0) {
      suggestions.push({
        kind: 'kill',
        campaignId,
        campaignName: name,
        title: `Pause ${name} and overhaul the offer`,
        detail: `0 replies after ${sends} sends. Do not load more into this copy.`
      })
      continue
    }
    if (sends >= 100 && rate < 0.01) {
      suggestions.push({
        kind: 'pause_inspect',
        campaignId,
        campaignName: name,
        title: `Inspect deliverability on ${name}`,
        detail: `${replies} replies on ${sends} sends (${(rate * 100).toFixed(1)}%). Check inboxes before changing the offer.`
      })
      continue
    }
    if (live && rate >= 0.05 && remaining < 50) {
      suggestions.push({
        kind: 'load_more',
        campaignId,
        campaignName: name,
        title: `Load more leads into ${name}`,
        detail: `${(rate * 100).toFixed(1)}% replies with ${remaining} left. Scrape, filter, openers, then push. Stay paused until Jules launches.`
      })
    }
  }

  if (suggestions.length === 0) {
    suggestions.push({
      kind: 'new_list',
      campaignId: null,
      campaignName: 'Next city or trade',
      title: 'Queue a new list',
      detail:
        'No live campaign is asking for more volume or a pause. Pick the next city or trade, filter, write openers, duplicate Fill and Capture, stay paused.'
    })
  }

  return suggestions.slice(0, 6)
}

export function groupCampaignsByWave(
  campaigns: CompassCampaign[],
  instantlyById: Map<string, OutboundBoardCampaign>
): Record<OfferWaveColumnId, CompassCampaign[]> {
  const buckets: Record<OfferWaveColumnId, CompassCampaign[]> = {
    recommended: [],
    next: [],
    live: []
  }
  for (const campaign of campaigns) {
    const instantly = campaign.instantly_campaign_id
      ? instantlyById.get(campaign.instantly_campaign_id)
      : undefined
    const metrics: OfferWaveMetrics = {
      sends: instantly?.sendCount ?? 0,
      replies: instantly?.replyCount ?? 0,
      positiveReplies: instantly?.positiveReplies ?? campaign.wave_positive_count ?? 0,
      instantlyStatus: instantly?.status
    }
    buckets[offerWaveColumn(campaign, metrics)].push(campaign)
  }
  return buckets
}

export const INSTANTLY_CAMPAIGN_APP = (id: string) =>
  `https://app.instantly.ai/app/campaign/${encodeURIComponent(id)}`

export function formatWaveDate(isoOrDateOnly: string | null | undefined): string {
  const raw = (isoOrDateOnly || '').trim()
  if (!raw) return ''
  const dateOnly = raw.length >= 10 && raw[4] === '-' ? raw.slice(0, 10) : raw
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? `${dateOnly}T00:00:00+10:00` : raw)
  if (Number.isNaN(parsed.getTime())) return dateOnly
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Sydney'
  }).format(parsed)
}

export function splitMorningBrief(recommendation: string | null | undefined): {
  headline: string
  watches: string[]
} {
  const text = (recommendation || '').trim()
  if (!text) return { headline: '', watches: [] }
  const parts = text
    .split(/(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  return { headline: parts[0] || text, watches: parts.slice(1) }
}

export function campaignDateOnly(
  campaign: Pick<CompassCampaign, 'go_live_at' | 'start_date'>
): string | null {
  if (campaign.go_live_at) {
    const value = dateOnlyInZone(campaign.go_live_at)
    if (value && !value.includes('undefined')) return value
  }
  const start = (campaign.start_date || '').trim()
  return start ? start.slice(0, 10) : null
}

export function splitNextQueue(
  campaigns: CompassCampaign[],
  today: string
): { upcoming: CompassCampaign[]; leftover: CompassCampaign[] } {
  const upcoming: CompassCampaign[] = []
  const leftover: CompassCampaign[] = []
  for (const campaign of campaigns) {
    const date = campaignDateOnly(campaign)
    const stale = Boolean(date && date < today && !(campaign.instantly_campaign_id || '').trim())
    if (stale) leftover.push(campaign)
    else upcoming.push(campaign)
  }
  return { upcoming, leftover }
}

export type LiveDeskItem = {
  key: string
  campaign: CompassCampaign | null
  instantly: OutboundBoardCampaign | null
}

function isInstantlySending(status: OutboundBoardCampaign['status'] | undefined): boolean {
  return status === 'live' || status === 'launching'
}

export function buildLiveDesk(input: {
  liveCampaigns: CompassCampaign[]
  allCampaigns?: CompassCampaign[]
  instantlyById: Map<string, OutboundBoardCampaign>
  instantlyRows: OutboundBoardCampaign[]
}): { sending: LiveDeskItem[]; parked: CompassCampaign[] } {
  const pool = input.allCampaigns ?? input.liveCampaigns
  const byInstantlyId = new Map(
    pool
      .filter((row) => (row.instantly_campaign_id || '').trim())
      .map((row) => [row.instantly_campaign_id as string, row])
  )
  const sending: LiveDeskItem[] = []
  const usedCampaignIds = new Set<string>()

  for (const row of input.instantlyRows) {
    if (!isInstantlySending(row.status)) continue
    const campaign = byInstantlyId.get(row.id) ?? null
    sending.push({
      key: campaign?.id || `instantly-${row.id}`,
      campaign,
      instantly: row
    })
    if (campaign) usedCampaignIds.add(campaign.id)
  }

  for (const campaign of input.liveCampaigns) {
    if (usedCampaignIds.has(campaign.id)) continue
    const instantly = campaign.instantly_campaign_id
      ? input.instantlyById.get(campaign.instantly_campaign_id)
      : undefined
    if (instantly && !isInstantlySending(instantly.status)) continue
    sending.push({
      key: campaign.id,
      campaign,
      instantly: instantly ?? null
    })
    usedCampaignIds.add(campaign.id)
  }

  const parked = input.liveCampaigns.filter((campaign) => !usedCampaignIds.has(campaign.id))
  return { sending, parked }
}

export function glanceLabel(updatedAt: number | null | undefined): string | null {
  if (!updatedAt) return null
  const delta = Date.now() - updatedAt
  if (delta < 15_000) return 'Instantly glance just now'
  const minutes = Math.max(1, Math.round(delta / 60_000))
  if (minutes < 60) return `Instantly glance ${minutes}m ago`
  return 'Instantly glance over an hour ago'
}
