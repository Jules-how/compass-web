import type { CompassCampaign } from '@/lib/campaigns'
import { normalizeCopyStatus } from '@/lib/outbound-copy'

export const WAVE_BOUNCE_WARN_PCT = 2

export const ENRICH_STATUSES = [
  'none',
  'queued',
  'enriched',
  'thin',
  'opener_ready',
  'uploaded'
] as const

export type WaveCheckId =
  | 'offer'
  | 'copy'
  | 'bound'
  | 'cohort'
  | 'cap'
  | 'openers'
  | 'reviewed'
  | 'bounce'
  | 'copy_match'

export type WaveCheck = {
  id: WaveCheckId
  label: string
  ok: boolean
  warn?: boolean
  blocking: boolean
  detail: string
}

export type WaveLeadRow = {
  enrich_status?: string | null
  opener?: string | null
  email?: string | null
  company?: string | null
  outbound_status?: string | null
}

export type WaveLeadSummary = {
  cohort: number
  openers: number
  missingCompanyOrEmail: number
  enrichMix: Record<string, number>
  positive: number
  meetings: number
}

export type WaveInstantlyVolume = {
  sent: number
  bounced: number
}

export type WaveSnapshot = {
  cap: number | null
  cohort: number
  openers: number
  missingCompanyOrEmail: number
  enrichMix: Record<string, number>
  positive: number
  meetings: number
  openerReviewedAt: string | null
  copyConfirmedAt: string | null
  instantly: { sent: number; bounced: number; bounceRate: number } | null
  checks: WaveCheck[]
  blocked: boolean
  readyToActivate: boolean
}

export function isPositiveOutboundStatus(status: string | null | undefined): boolean {
  const s = (status || '').trim()
  return s === 'interested' || s === 'meeting_booked' || s === 'booked' || s === 'converted'
}

export function isMeetingOutboundStatus(status: string | null | undefined): boolean {
  const s = (status || '').trim()
  return s === 'meeting_booked' || s === 'booked'
}

export function summarizeWaveLeads(rows: WaveLeadRow[]): WaveLeadSummary {
  const enrichMix: Record<string, number> = {}
  let openers = 0
  let missingCompanyOrEmail = 0
  let positive = 0
  let meetings = 0
  for (const row of rows) {
    const enrich = (row.enrich_status || 'none').trim() || 'none'
    enrichMix[enrich] = (enrichMix[enrich] || 0) + 1
    if ((row.opener || '').trim()) openers += 1
    const email = (row.email || '').trim()
    const company = (row.company || '').trim()
    if (!email || !company) missingCompanyOrEmail += 1
    if (isPositiveOutboundStatus(row.outbound_status)) positive += 1
    if (isMeetingOutboundStatus(row.outbound_status)) meetings += 1
  }
  return {
    cohort: rows.length,
    openers,
    missingCompanyOrEmail,
    enrichMix,
    positive,
    meetings
  }
}

function bounceRate(sent: number, bounced: number): number {
  if (sent <= 0) return 0
  return Math.round((1000 * bounced) / sent) / 10
}

export function buildWaveSnapshot(input: {
  campaign: Pick<
    CompassCampaign,
    | 'offer_key'
    | 'copy_status'
    | 'instantly_campaign_id'
    | 'wave_cap'
    | 'opener_reviewed_at'
    | 'copy_confirmed_at'
  >
  leads: WaveLeadSummary
  instantly?: WaveInstantlyVolume | null
  includeCopyMatch?: boolean
}): WaveSnapshot {
  const cap =
    typeof input.campaign.wave_cap === 'number' && Number.isFinite(input.campaign.wave_cap)
      ? Math.max(0, Math.floor(input.campaign.wave_cap))
      : null
  const copyStatus = normalizeCopyStatus(input.campaign.copy_status)
  const bound = Boolean((input.campaign.instantly_campaign_id || '').trim())
  const offer = Boolean((input.campaign.offer_key || '').trim())
  const copyOk = copyStatus === 'draft' || copyStatus === 'ready' || copyStatus === 'live'
  const reviewedAt = input.campaign.opener_reviewed_at ?? null
  const confirmedAt = input.campaign.copy_confirmed_at ?? null
  const cohort = input.leads.cohort
  const openers = input.leads.openers
  const volume = input.instantly ?? null
  const rate = volume ? bounceRate(volume.sent, volume.bounced) : 0
  const bounceWarn = Boolean(volume && volume.sent > 0 && rate > WAVE_BOUNCE_WARN_PCT)
  const includeCopyMatch = input.includeCopyMatch !== false

  const checks: WaveCheck[] = [
    {
      id: 'offer',
      label: 'Offer locked',
      ok: offer,
      blocking: true,
      detail: offer ? String(input.campaign.offer_key) : 'Pick one offer on this campaign'
    },
    {
      id: 'copy',
      label: 'Copy drafted',
      ok: copyOk,
      blocking: true,
      detail: copyOk ? copyStatus : 'Compose a sequence before this wave'
    },
    {
      id: 'bound',
      label: 'Instantly bound',
      ok: bound,
      blocking: true,
      detail: bound ? 'Campaign linked' : 'Bind an Instantly campaign. Activate stays in Instantly.'
    },
    {
      id: 'cohort',
      label: 'Cohort attached',
      ok: cohort > 0,
      blocking: true,
      detail: cohort > 0 ? `${cohort} lead${cohort === 1 ? '' : 's'}` : 'Attach leads to this campaign'
    },
    {
      id: 'cap',
      label: 'Wave cap',
      ok: cap != null && cap > 0 && cohort <= cap,
      blocking: true,
      detail:
        cap == null
          ? 'Set a cap (30–50 for a first wave)'
          : cohort > cap
            ? `${cohort} leads over the cap of ${cap}`
            : `${cohort} / ${cap}`
    },
    {
      id: 'openers',
      label: 'Openers present',
      ok: cohort === 0 ? false : openers === cohort,
      blocking: true,
      detail:
        cohort === 0
          ? 'No leads to research'
          : `${openers} / ${cohort} have an opener`
    },
    {
      id: 'reviewed',
      label: 'Openers read',
      ok: Boolean(reviewedAt),
      blocking: true,
      detail: reviewedAt ? 'You confirmed this wave' : 'Read every opener, then tick this'
    }
  ]

  if (volume && volume.sent > 0) {
    checks.push({
      id: 'bounce',
      label: 'Bounce',
      ok: !bounceWarn,
      warn: bounceWarn,
      blocking: false,
      detail: `${rate}% (${volume.bounced} / ${volume.sent})`
    })
  }

  if (includeCopyMatch) {
    const matchOk = copyStatus === 'live' && bound && Boolean(confirmedAt)
    checks.push({
      id: 'copy_match',
      label: 'Copy matches Instantly',
      ok: matchOk,
      blocking: true,
      detail: matchOk
        ? 'Confirmed'
        : copyStatus !== 'live'
          ? 'Copy must be live'
          : !bound
            ? 'Bind Instantly first'
            : 'Confirm Compass copy matches the Instantly body'
    })
  }

  const blocked = checks.some((c) => c.blocking && !c.ok)
  return {
    cap,
    cohort,
    openers,
    missingCompanyOrEmail: input.leads.missingCompanyOrEmail,
    enrichMix: input.leads.enrichMix,
    positive: input.leads.positive,
    meetings: input.leads.meetings,
    openerReviewedAt: reviewedAt,
    copyConfirmedAt: confirmedAt,
    instantly: volume
      ? { sent: volume.sent, bounced: volume.bounced, bounceRate: rate }
      : null,
    checks,
    blocked,
    readyToActivate: !blocked
  }
}

export function wavePlannerBit(
  campaign: Pick<
    CompassCampaign,
    'offer_key' | 'copy_status' | 'instantly_campaign_id' | 'wave_cap' | 'opener_reviewed_at'
  >,
  cohort: number
): string | null {
  const cap =
    typeof campaign.wave_cap === 'number' && Number.isFinite(campaign.wave_cap)
      ? Math.max(0, Math.floor(campaign.wave_cap))
      : null
  if (
    cap == null &&
    !campaign.offer_key &&
    normalizeCopyStatus(campaign.copy_status) === 'none' &&
    !campaign.instantly_campaign_id &&
    !campaign.opener_reviewed_at
  ) {
    return null
  }
  const lite = buildWaveSnapshot({
    campaign,
    leads: {
      cohort,
      openers: cohort,
      missingCompanyOrEmail: 0,
      enrichMix: {},
      positive: 0,
      meetings: 0
    },
    instantly: null,
    includeCopyMatch: false
  })
  const capCheck = lite.checks.find((c) => c.id === 'cap')
  const coreBlocked = lite.checks
    .filter((c) => c.id === 'offer' || c.id === 'copy' || c.id === 'bound' || c.id === 'cap' || c.id === 'reviewed')
    .some((c) => !c.ok)
  if (coreBlocked) return 'Wave blocked'
  if (cap != null) return `Wave ${cohort}/${cap}`
  return capCheck?.detail ?? 'Wave'
}

export function emptyWaveLeadSummary(): WaveLeadSummary {
  return {
    cohort: 0,
    openers: 0,
    missingCompanyOrEmail: 0,
    enrichMix: {},
    positive: 0,
    meetings: 0
  }
}

export function summarizeLeadsByCampaign(
  rows: Array<WaveLeadRow & { pipeline_campaign_id?: string | null }>
): Record<string, WaveLeadSummary> {
  const buckets: Record<string, WaveLeadRow[]> = {}
  for (const row of rows) {
    const id = (row.pipeline_campaign_id || '').trim()
    if (!id) continue
    ;(buckets[id] ??= []).push(row)
  }
  return Object.fromEntries(
    Object.entries(buckets).map(([id, list]) => [id, summarizeWaveLeads(list)])
  )
}

export function tallyLeadsByCampaign(
  rows: Array<{ pipeline_campaign_id?: string | null; outbound_status?: string | null }>
): Record<string, { cohort: number; positive: number; meetings: number }> {
  const grouped = summarizeLeadsByCampaign(rows)
  return Object.fromEntries(
    Object.entries(grouped).map(([id, summary]) => [
      id,
      { cohort: summary.cohort, positive: summary.positive, meetings: summary.meetings }
    ])
  )
}

export function compactWaveForAgent(snapshot: WaveSnapshot) {
  return {
    cap: snapshot.cap,
    cohort: snapshot.cohort,
    openers: snapshot.openers,
    blocked: snapshot.blocked,
    readyToActivate: snapshot.readyToActivate,
    openerReviewedAt: snapshot.openerReviewedAt,
    copyConfirmedAt: snapshot.copyConfirmedAt
  }
}

export function applyLeadTallies<T extends { id: string }>(
  campaigns: T[],
  tallies: Record<string, { cohort: number; positive: number; meetings: number }>
): Array<T & { wave_cohort_count: number; wave_positive_count: number; wave_meeting_count: number }> {
  return campaigns.map((campaign) => {
    const tally = tallies[campaign.id]
    return {
      ...campaign,
      wave_cohort_count: tally?.cohort ?? 0,
      wave_positive_count: tally?.positive ?? 0,
      wave_meeting_count: tally?.meetings ?? 0
    }
  })
}

export function copyPatchClearsConfirm(body: {
  sequence_draft?: unknown
  cold_expression?: unknown
  copy_confirmed_at?: unknown
}): boolean {
  if (body.copy_confirmed_at !== undefined) return false
  return body.sequence_draft !== undefined || body.cold_expression !== undefined
}

export function parseWaveCap(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value))
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n))
  }
  return undefined
}
