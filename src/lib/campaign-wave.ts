import type { CompassCampaign } from '@/lib/campaigns'
import { isIcpSkip } from '@/lib/lead-icp'
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
  opener_track?: string | null
  opener_kind?: string | null
  icp_status?: string | null
}

export type KindStats = {
  n: number
  positive: number
  meetings: number
}

export type WaveLeadSummary = {
  cohort: number
  openers: number
  missingCompanyOrEmail: number
  enrichMix: Record<string, number>
  positive: number
  meetings: number
  signal: number
  tension: number
  thin: number
  skip: number
  byKind: Record<string, KindStats>
}

export type WaveInstantlyVolume = {
  sent: number
  bounced: number
}

export type WaveSnapshot = {
  cohort: number
  openers: number
  missingCompanyOrEmail: number
  enrichMix: Record<string, number>
  positive: number
  meetings: number
  signal: number
  tension: number
  thin: number
  skip: number
  byKind: Record<string, KindStats>
  openerReviewedAt: string | null
  copyConfirmedAt: string | null
  instantly: { sent: number; bounced: number; bounceRate: number } | null
  positivesPer100Delivered: number | null
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
  const byKind: Record<string, KindStats> = {}
  let openers = 0
  let missingCompanyOrEmail = 0
  let positive = 0
  let meetings = 0
  let signal = 0
  let tension = 0
  let thin = 0
  let skip = 0
  for (const row of rows) {
    const enrich = (row.enrich_status || 'none').trim() || 'none'
    enrichMix[enrich] = (enrichMix[enrich] || 0) + 1
    const skipped = isIcpSkip(row.icp_status)
    const email = (row.email || '').trim()
    const company = (row.company || '').trim()
    if (!email || !company) missingCompanyOrEmail += 1
    if (isPositiveOutboundStatus(row.outbound_status)) positive += 1
    if (isMeetingOutboundStatus(row.outbound_status)) meetings += 1
    const track = (row.opener_track || '').trim()
    const isThin = enrich === 'thin' || track === 'none'
    if (skipped) skip += 1
    else if (isThin) thin += 1
    else if ((row.opener || '').trim()) openers += 1
    if (!skipped && !isThin && track === 'signal') signal += 1
    else if (!skipped && !isThin && track === 'tension') tension += 1
    const kind = track === 'tension'
      ? 'tension'
      : ((row.opener_kind || '').trim() || (track && track !== 'none' ? track : ''))
    if (kind && kind !== 'none') {
      const stats = byKind[kind] || { n: 0, positive: 0, meetings: 0 }
      stats.n += 1
      if (isPositiveOutboundStatus(row.outbound_status)) stats.positive += 1
      if (isMeetingOutboundStatus(row.outbound_status)) stats.meetings += 1
      byKind[kind] = stats
    }
  }
  return {
    cohort: rows.length,
    openers,
    missingCompanyOrEmail,
    enrichMix,
    positive,
    meetings,
    signal,
    tension,
    thin,
    skip,
    byKind
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
    | 'opener_reviewed_at'
    | 'copy_confirmed_at'
  >
  leads: WaveLeadSummary
  instantly?: WaveInstantlyVolume | null
  includeCopyMatch?: boolean
}): WaveSnapshot {
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
      id: 'openers',
      label: 'First lines present',
      ok:
        cohort === 0
          ? false
          : openers === cohort - (input.leads.thin || 0) - (input.leads.skip || 0),
      blocking: true,
      detail:
        cohort === 0
          ? 'No leads to research'
          : `${openers} / ${cohort - (input.leads.thin || 0) - (input.leads.skip || 0)} sendable · ${input.leads.thin || 0} thin · ${input.leads.skip || 0} skip`
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

  const delivered = volume ? Math.max(0, volume.sent - volume.bounced) : 0
  const positivesPer100Delivered =
    volume && delivered > 0
      ? Math.round((1000 * input.leads.positive) / delivered) / 10
      : null
  const blocked = checks.some((c) => c.blocking && !c.ok)
  return {
    cohort,
    openers,
    missingCompanyOrEmail: input.leads.missingCompanyOrEmail,
    enrichMix: input.leads.enrichMix,
    positive: input.leads.positive,
    meetings: input.leads.meetings,
    signal: input.leads.signal || 0,
    tension: input.leads.tension || 0,
    thin: input.leads.thin || 0,
    skip: input.leads.skip || 0,
    byKind: input.leads.byKind || {},
    openerReviewedAt: reviewedAt,
    copyConfirmedAt: confirmedAt,
    instantly: volume
      ? { sent: volume.sent, bounced: volume.bounced, bounceRate: rate }
      : null,
    positivesPer100Delivered,
    checks,
    blocked,
    readyToActivate: !blocked
  }
}

export function wavePlannerBit(
  campaign: Pick<
    CompassCampaign,
    'offer_key' | 'copy_status' | 'instantly_campaign_id' | 'opener_reviewed_at'
  >,
  cohort: number
): string | null {
  if (
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
      meetings: 0,
      signal: 0,
      tension: 0,
      thin: 0,
      skip: 0,
      byKind: {}
    },
    instantly: null,
    includeCopyMatch: false
  })
  const coreBlocked = lite.checks
    .filter((c) => c.id === 'offer' || c.id === 'copy' || c.id === 'bound' || c.id === 'reviewed')
    .some((c) => !c.ok)
  if (coreBlocked) return 'Wave blocked'
  if (cohort > 0) return `${cohort} lead${cohort === 1 ? '' : 's'}`
  return 'Wave'
}

export function emptyWaveLeadSummary(): WaveLeadSummary {
  return {
    cohort: 0,
    openers: 0,
    missingCompanyOrEmail: 0,
    enrichMix: {},
    positive: 0,
    meetings: 0,
    signal: 0,
    tension: 0,
    thin: 0,
    skip: 0,
    byKind: {}
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

export type LeadTally = {
  cohort: number
  positive: number
  meetings: number
  openers: number
}

export function researchState(openers: number, cohort: number): 'none' | 'partial' | 'done' {
  if (cohort <= 0 || openers <= 0) return 'none'
  if (openers >= cohort) return 'done'
  return 'partial'
}

export function tallyLeadsByCampaign(
  rows: Array<{
    pipeline_campaign_id?: string | null
    outbound_status?: string | null
    opener?: string | null
  }>
): Record<string, LeadTally> {
  const grouped = summarizeLeadsByCampaign(rows)
  return Object.fromEntries(
    Object.entries(grouped).map(([id, summary]) => [
      id,
      {
        cohort: summary.cohort,
        positive: summary.positive,
        meetings: summary.meetings,
        openers: summary.openers
      }
    ])
  )
}

export function compactWaveForAgent(snapshot: WaveSnapshot) {
  return {
    cohort: snapshot.cohort,
    openers: snapshot.openers,
    blocked: snapshot.blocked,
    readyToActivate: snapshot.readyToActivate,
    openerReviewedAt: snapshot.openerReviewedAt,
    copyConfirmedAt: snapshot.copyConfirmedAt,
    signal: snapshot.signal,
    tension: snapshot.tension,
    thin: snapshot.thin,
    skip: snapshot.skip,
    by_kind: snapshot.byKind,
    positivesPer100Delivered: snapshot.positivesPer100Delivered
  }
}

export function applyLeadTallies<T extends { id: string }>(
  campaigns: T[],
  tallies: Record<string, LeadTally>
): Array<
  T & {
    wave_cohort_count: number
    wave_positive_count: number
    wave_meeting_count: number
    wave_opener_count: number
  }
> {
  return campaigns.map((campaign) => {
    const tally = tallies[campaign.id]
    return {
      ...campaign,
      wave_cohort_count: tally?.cohort ?? 0,
      wave_positive_count: tally?.positive ?? 0,
      wave_meeting_count: tally?.meetings ?? 0,
      wave_opener_count: tally?.openers ?? 0
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

