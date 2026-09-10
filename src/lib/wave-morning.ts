/** Morning Home wave loop. Instantly sending + two next slots + accept/dismiss gate. */

import type { HomeLeverageTask } from '@/lib/home-setup'

export const LAND_REMAINING_THRESHOLD = 50
export const HOME_NEXT_SLOTS = 2

export const WAVE_BRIEF_STATUSES = ['proposed', 'accepted', 'dismissed'] as const
export type WaveBriefStatus = (typeof WAVE_BRIEF_STATUSES)[number]

export type WaveBriefRecord = {
  id: string
  next_campaign_ids: string[]
  next_status: WaveBriefStatus | string
  generated_at?: string | null
  recommendation?: string | null
}

export type MorningSendingRow = {
  campaignId: string | null
  instantlyId: string
  name: string
  remaining: number
  copyConfirmed: boolean
  openerReviewed: boolean
  bound: boolean
}

export function normalizeWaveBriefStatus(value: string | null | undefined): WaveBriefStatus {
  if (value === 'accepted' || value === 'dismissed') return value
  return 'proposed'
}

export function clipNextIds(ids: Array<string | null | undefined> | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of ids ?? []) {
    const id = (raw || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= HOME_NEXT_SLOTS) break
  }
  return out
}

export function remainingIsLow(remaining: number | null | undefined): boolean {
  return Math.max(0, remaining || 0) < LAND_REMAINING_THRESHOLD
}

export function copyIsBlocked(row: { bound: boolean; copyConfirmed: boolean }): boolean {
  return row.bound && !row.copyConfirmed
}

export function landUnlocked(status: WaveBriefStatus | 'missing'): boolean {
  return status === 'accepted' || status === 'dismissed'
}

export function canCreateNext(currentCount: number, creating: number): boolean {
  if (creating <= 0) return true
  return currentCount + creating <= HOME_NEXT_SLOTS
}

export function resolveHomeNext(input: {
  today: WaveBriefRecord | null
  lastAccepted: WaveBriefRecord | null
}): {
  briefStatus: WaveBriefStatus | 'missing'
  activeNextIds: string[]
  proposedNextIds: string[]
  landUnlocked: boolean
} {
  if (!input.today) {
    return {
      briefStatus: 'missing',
      activeNextIds: clipNextIds(input.lastAccepted?.next_campaign_ids),
      proposedNextIds: [],
      landUnlocked: false
    }
  }
  const status = normalizeWaveBriefStatus(input.today.next_status)
  const proposed = clipNextIds(input.today.next_campaign_ids)
  if (status === 'accepted') {
    return {
      briefStatus: 'accepted',
      activeNextIds: proposed,
      proposedNextIds: proposed,
      landUnlocked: true
    }
  }
  if (status === 'dismissed') {
    return {
      briefStatus: 'dismissed',
      activeNextIds: clipNextIds(input.lastAccepted?.next_campaign_ids),
      proposedNextIds: [],
      landUnlocked: true
    }
  }
  return {
    briefStatus: 'proposed',
    activeNextIds: clipNextIds(input.lastAccepted?.next_campaign_ids),
    proposedNextIds: proposed,
    landUnlocked: false
  }
}

export function applyBriefDecision(
  today: WaveBriefRecord,
  action: 'accept' | 'dismiss',
  at = new Date()
): Pick<WaveBriefRecord, 'next_status'> & { resolved_at: string } {
  return {
    next_status: action === 'accept' ? 'accepted' : 'dismissed',
    resolved_at: at.toISOString()
  }
}

/** Agent may overwrite today's next only while still proposed. */
export function briefAllowsNextOverwrite(status: WaveBriefStatus | string | null | undefined): boolean {
  return normalizeWaveBriefStatus(status) === 'proposed'
}

export type MorningNextCard = {
  campaignId: string
  name: string
  trade: string | null
  city: string | null
  buildStatus: 'queued' | 'building' | 'ready' | 'reviewed' | 'landed' | 'failed' | 'none'
  runDetail: string | null
}

export type MorningSendingCard = {
  key: string
  campaignId: string | null
  instantlyId: string | null
  name: string
  remaining: number
  lowRemaining: boolean
  copyConfirmed: boolean
  openerReviewed: boolean
  copyBlocked: boolean
  instantlyHref: string | null
  deskHref: string
}

export type MorningWavePayload = {
  reviewState?: 'current' | 'stale' | 'unreviewed' | 'missing'
  briefDate?: string | null
  briefRevision?: number
  reviewedAt?: string | null
  publisher?: string | null
  runId?: string | null
  metricsUpdatedAt?: string | null
  sydneyDate: string
  briefStatus: ReturnType<typeof resolveHomeNext>['briefStatus']
  landUnlocked: boolean
  recommendation: string | null
  homeBlurb: string | null
  writeup: string | null
  instantlyRepliesWaiting: number
  sending: MorningSendingCard[]
  activeNext: MorningNextCard[]
  proposedNext: MorningNextCard[]
  leverage: HomeLeverageTask[]
}
