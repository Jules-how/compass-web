/** Roll Instantly outbound metrics up by campaign copy factors. */

import type { CompassCampaign } from '@/lib/campaigns'
import type { OutboundBoardCampaign, OutboundBoard } from '@/lib/instantly'
import { normalizeCopyStatus, type OutboundSequence } from '@/lib/outbound-copy'
import { splitCampaignMeta } from '@/lib/sales-overview'

export type OutboundFactorKey =
  | 'offer'
  | 'cta'
  | 'cta_type'
  | 'expression'
  | 'structure'
  | 'length'
  | 'audience'

export type OutboundFactorCampaign = OutboundBoardCampaign & {
  cta: string
  ctaType: string
  lengthBand: string
  audience: string
  expression: string
  structure: string
  pipelineCampaignId?: string
}

export type OutboundFactorRow = {
  key: string
  subtitle?: string
  campaigns: number
  sent: number
  replies: number
  replyRate: number
  meetings: number
  opportunities: number
  campaignIds: string[]
}

const STRUCTURE_LENGTH: Record<string, string> = {
  'nick-3step': 'Short',
  'nick-4step': 'Medium',
  'platten-aida': 'Long',
  'connor-3para': 'Long'
}

export function lengthBandFromStructure(structureId: string | null | undefined): string {
  if (!structureId) return ''
  return STRUCTURE_LENGTH[structureId] || ''
}

export function lengthBandFromStepCount(steps: number): string {
  if (steps <= 0) return ''
  if (steps <= 2) return 'Short'
  if (steps === 3) return 'Medium'
  return 'Long'
}

export function guessCtaType(body: string): string {
  const t = body.toLowerCase()
  if (!t.trim()) return ''
  if (t.includes('mind if') || t.includes('permission') || t.includes('send over')) {
    return 'permission'
  }
  if (t.includes('min call') || t.includes('thu') || t.includes('fri') || t.includes('this week')) {
    return 'timed_call'
  }
  if (t.includes('open to') || t.includes('worth exploring') || t.includes('curious')) {
    return 'interest_check'
  }
  if (t.includes('i put together') || t.includes('sent you') || t.includes('attached')) {
    return 'give_first'
  }
  return 'other'
}

export function ctaFromSequence(sequence: OutboundSequence | null | undefined): {
  label: string
  type: string
} {
  if (!sequence?.steps?.length) return { label: '', type: '' }
  const email = sequence.steps.find((s) => s.kind === 'email') || sequence.steps[0]
  const slot =
    email.slots?.find((s) => s.key === 'cta') ||
    email.slots?.find((s) => s.key === 'availability_ask')
  const label = (slot?.body || '').replace(/\s+/g, ' ').trim()
  return { label, type: guessCtaType(label) }
}

export function audienceFromTags(
  vertical: string | string[] | null | undefined,
  location: string | string[] | null | undefined
): string {
  const v = Array.isArray(vertical) ? vertical.filter(Boolean)[0] : vertical
  const l = Array.isArray(location) ? location.filter(Boolean)[0] : location
  const parts = [v, l].map((p) => (p || '').trim()).filter(Boolean)
  return parts.join(' · ')
}

/** Stable expression label for rollup (prefer expression_key). */
export function expressionLabel(
  expressionKey: string | null | undefined,
  coldExpression: string | null | undefined
): string {
  const key = (expressionKey || '').trim()
  if (key) return key
  const body = (coldExpression || '').replace(/\s+/g, ' ').trim()
  if (!body) return '—'
  return body.length > 64 ? `${body.slice(0, 61)}…` : body
}

function parseCopyNotes(notes: string): {
  lengthBand: string
  ctaType: string
  cta: string
} {
  const lower = notes.toLowerCase()
  let lengthBand = ''
  if (lower.includes('nick 3') || lower.includes('3-step') || lower.includes('3 step')) {
    lengthBand = 'Short'
  } else if (lower.includes('nick 4') || lower.includes('4-step') || lower.includes('4 step')) {
    lengthBand = 'Medium'
  } else if (lower.includes('aida') || lower.includes('connor') || lower.includes('3-para')) {
    lengthBand = 'Long'
  }

  let ctaType = ''
  if (lower.includes('permission')) ctaType = 'permission'
  else if (lower.includes('timed call')) ctaType = 'timed_call'
  else if (lower.includes('interest-check') || lower.includes('interest check')) {
    ctaType = 'interest_check'
  } else if (lower.includes('give-first') || lower.includes('give first')) {
    ctaType = 'give_first'
  }

  return {
    lengthBand,
    ctaType,
    cta: ctaType ? ctaType.replace(/_/g, ' ') : ''
  }
}

export function findBind(
  campaign: { id: string },
  pipeline: CompassCampaign[]
): CompassCampaign | null {
  const byInstantly = pipeline.find(
    (p) => p.instantly_campaign_id && p.instantly_campaign_id === campaign.id
  )
  if (byInstantly) return byInstantly
  return pipeline.find((p) => p.id === campaign.id) ?? null
}

/** Compass campaigns still in workshop — not live/paused on Instantly. */
export function isWorkshopCampaign(
  campaign: CompassCampaign,
  liveInstantlyIds: Set<string>
): boolean {
  const status = String(campaign.status || '')
  if (status === 'completed' || status === 'cancelled') return false
  const copy = normalizeCopyStatus(campaign.copy_status)
  if (copy === 'live') return false
  const instantlyId = campaign.instantly_campaign_id?.trim()
  if (instantlyId && liveInstantlyIds.has(instantlyId)) return false
  return copy === 'none' || copy === 'draft' || copy === 'ready'
}

/** Attach offer / CTA / length / audience onto a board campaign using pipeline binds + fallbacks. */
export function enrichOutboundCampaignFactors(
  campaign: OutboundBoardCampaign,
  pipeline: CompassCampaign[] = [],
  offerNames: Record<string, string> = {}
): OutboundFactorCampaign {
  const bind = findBind(campaign, pipeline)
  const fromSeq = ctaFromSequence(bind?.sequence_draft ?? null)
  const fromNotes = parseCopyNotes(campaign.copyNotes || '')

  const offerKey = (bind?.offer_key || campaign.offerKey || '').trim()
  const offer =
    (offerKey && offerNames[offerKey]) ||
    campaign.offer ||
    (offerKey ? offerKey : '') ||
    splitCampaignMeta(campaign.name).offer ||
    '—'

  const lengthBand =
    lengthBandFromStructure(bind?.structure_id) ||
    lengthBandFromStepCount(bind?.sequence_draft?.steps?.length || 0) ||
    campaign.lengthBand ||
    fromNotes.lengthBand ||
    '—'

  const cta = fromSeq.label || campaign.cta || fromNotes.cta || '—'
  const explicitCtaType = (bind?.cta_type || '').trim()
  const ctaType =
    explicitCtaType || fromSeq.type || campaign.ctaType || fromNotes.ctaType || ''

  const audience =
    audienceFromTags(
      bind?.vertical_tags?.length ? bind.vertical_tags : campaign.vertical,
      bind?.location_tags?.length ? bind.location_tags : campaign.location
    ) ||
    campaign.audience ||
    '—'

  const structure = (bind?.structure_id || '').trim() || '—'
  const expression = expressionLabel(bind?.expression_key, bind?.cold_expression)

  return {
    ...campaign,
    offer: offer === '—' && campaign.offer ? campaign.offer : offer,
    offerKey: offerKey || campaign.offerKey || '',
    vertical:
      (bind?.vertical_tags && bind.vertical_tags[0]) || campaign.vertical || '',
    location:
      (bind?.location_tags && bind.location_tags[0]) || campaign.location || '',
    cta,
    ctaType,
    lengthBand,
    audience,
    expression,
    structure,
    pipelineCampaignId: bind?.id
  }
}

export function enrichOutboundBoardFactors(
  board: OutboundBoard,
  pipeline: CompassCampaign[] = [],
  offerNames: Record<string, string> = {}
): { live: OutboundFactorCampaign[]; history: OutboundFactorCampaign[] } {
  return {
    live: board.live.map((c) => enrichOutboundCampaignFactors(c, pipeline, offerNames)),
    history: board.history.map((c) => enrichOutboundCampaignFactors(c, pipeline, offerNames))
  }
}

export function factorValue(campaign: OutboundFactorCampaign, key: OutboundFactorKey): string {
  if (key === 'offer') return campaign.offer || campaign.offerKey || '—'
  if (key === 'cta') return campaign.cta || '—'
  if (key === 'cta_type') return campaign.ctaType || '—'
  if (key === 'expression') return campaign.expression || '—'
  if (key === 'structure') return campaign.structure || '—'
  if (key === 'length') return campaign.lengthBand || '—'
  return campaign.audience || '—'
}

export function rollupOutboundByFactor(
  campaigns: OutboundFactorCampaign[],
  key: OutboundFactorKey
): OutboundFactorRow[] {
  const map = new Map<string, OutboundFactorRow>()
  for (const c of campaigns) {
    const factorKey = factorValue(c, key)
    const cur = map.get(factorKey) ?? {
      key: factorKey,
      subtitle: key === 'cta' && c.ctaType ? c.ctaType : undefined,
      campaigns: 0,
      sent: 0,
      replies: 0,
      replyRate: 0,
      meetings: 0,
      opportunities: 0,
      campaignIds: []
    }
    cur.campaigns += 1
    cur.sent += c.sendCount
    cur.replies += c.replyCount
    cur.meetings += c.meetings || c.opportunities || 0
    cur.opportunities += c.opportunities
    cur.campaignIds.push(c.id)
    map.set(factorKey, cur)
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      replyRate: row.sent ? Math.round((row.replies / row.sent) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.replyRate - a.replyRate || b.sent - a.sent)
}

/** Count how many locked factors differ between two enriched campaigns. */
export function countFactorDifferences(
  a: OutboundFactorCampaign,
  b: OutboundFactorCampaign
): number {
  const keys: OutboundFactorKey[] = ['offer', 'cta_type', 'expression', 'structure', 'audience']
  let n = 0
  for (const key of keys) {
    if (factorValue(a, key) !== factorValue(b, key)) n += 1
  }
  return n
}
