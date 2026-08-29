/** Compact ledger inventory for agent orient. No per-contact dump. */

import { canonicalizeState, canonicalizeVertical } from '@/lib/leads-inventory'
import { verticalFilterValues } from '@/lib/leads-meta'

export const LAST_OUTBOUND_BUCKETS = ['blank', '0-14', '15-30', '31-60', '61-90', '90+'] as const
export type LastOutboundBucket = (typeof LAST_OUTBOUND_BUCKETS)[number]

export const EXPORT_MAX_LIMIT = 200
export const EXPORT_DEFAULT_LIMIT = 50
export const LEDGER_ROW_CAP = 50000
export const TOP_CAMPAIGN_NAMES = 12

const DAY_MS = 86400000

export function lastOutboundBucket(
  iso: string | null | undefined,
  nowMs = Date.now()
): LastOutboundBucket {
  if (!iso) return 'blank'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'blank'
  const days = Math.floor((nowMs - t) / DAY_MS)
  if (days <= 14) return '0-14'
  if (days <= 30) return '15-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

export function parseIdList(raw: string | null | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const id = part.trim()
    if (id) seen.add(id)
  }
  return Array.from(seen)
}

export function campaignIdsFromLead(
  ids: unknown,
  latestId?: string | null
): string[] {
  const seen = new Set<string>()
  if (Array.isArray(ids)) {
    for (const item of ids) {
      const id = String(item ?? '').trim()
      if (id) seen.add(id)
    }
  } else if (typeof ids === 'string' && ids.trim()) {
    try {
      const parsed = JSON.parse(ids) as unknown
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const id = String(item ?? '').trim()
          if (id) seen.add(id)
        }
      }
    } catch {
      for (const part of ids.split(',')) {
        const id = part.trim()
        if (id) seen.add(id)
      }
    }
  }
  const latest = (latestId || '').trim()
  if (latest) seen.add(latest)
  return Array.from(seen)
}

export type CampaignOverlapKind = 'old_only' | 'later_only' | 'both' | 'neither'

export function campaignOverlapKind(
  rowIds: string[],
  oldIds: Set<string>,
  laterIds: Set<string>
): CampaignOverlapKind {
  const hasOld = rowIds.some((id) => oldIds.has(id))
  const hasLater = rowIds.some((id) => laterIds.has(id))
  if (hasOld && hasLater) return 'both'
  if (hasOld) return 'old_only'
  if (hasLater) return 'later_only'
  return 'neither'
}

export function ledgerVerticalValues(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  const canonical = canonicalizeVertical(trimmed)
  return [...new Set([...verticalFilterValues(trimmed), ...verticalFilterValues(canonical)])]
}

export type LedgerLeadRow = {
  vertical?: string | null
  outbound_status?: string | null
  state?: string | null
  last_outbound_at?: string | null
  instantly_campaign_name?: string | null
  instantly_campaign_id?: string | null
  instantly_campaign_ids?: unknown
}

export type LeadLedgerPayload = {
  generatedAt: string
  vertical: string
  total: number
  byStatus: Record<string, number>
  byState: Record<string, number>
  lastOutbound: Record<LastOutboundBucket, number>
  topCampaignNames: Array<{ name: string; count: number }>
  overlap: {
    campaign_ids: string[]
    later_campaign_ids: string[]
    old_only: number
    later_only: number
    both: number
    neither: number
  } | null
}

function emptyBuckets(): Record<LastOutboundBucket, number> {
  return { blank: 0, '0-14': 0, '15-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
}

export function buildLeadLedger(
  rows: LedgerLeadRow[],
  opts: {
    vertical: string
    campaignIds?: string[]
    laterCampaignIds?: string[]
    nowMs?: number
  }
): LeadLedgerPayload {
  const target = canonicalizeVertical(opts.vertical)
  const oldIds = new Set(opts.campaignIds ?? [])
  const laterIds = new Set(opts.laterCampaignIds ?? [])
  const wantOverlap = oldIds.size > 0 || laterIds.size > 0
  const nowMs = opts.nowMs ?? Date.now()

  const byStatus: Record<string, number> = {}
  const byState: Record<string, number> = {}
  const lastOutbound = emptyBuckets()
  const campaignNames: Record<string, number> = {}
  const overlap = {
    campaign_ids: [...oldIds],
    later_campaign_ids: [...laterIds],
    old_only: 0,
    later_only: 0,
    both: 0,
    neither: 0
  }

  let total = 0
  for (const row of rows) {
    if (canonicalizeVertical(row.vertical) !== target) continue
    total += 1
    const status = (row.outbound_status || '').trim() || '(blank)'
    byStatus[status] = (byStatus[status] || 0) + 1
    const state = canonicalizeState(row.state)
    byState[state] = (byState[state] || 0) + 1
    lastOutbound[lastOutboundBucket(row.last_outbound_at, nowMs)] += 1
    const name = (row.instantly_campaign_name || '').trim()
    if (name) campaignNames[name] = (campaignNames[name] || 0) + 1
    if (wantOverlap) {
      const kind = campaignOverlapKind(
        campaignIdsFromLead(row.instantly_campaign_ids, row.instantly_campaign_id),
        oldIds,
        laterIds
      )
      overlap[kind] += 1
    }
  }

  const topCampaignNames = Object.entries(campaignNames)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, TOP_CAMPAIGN_NAMES)

  return {
    generatedAt: new Date(nowMs).toISOString(),
    vertical: target,
    total,
    byStatus,
    byState,
    lastOutbound,
    topCampaignNames,
    overlap: wantOverlap ? overlap : null
  }
}

export function clampExportLimit(n: unknown): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return EXPORT_DEFAULT_LIMIT
  return Math.min(EXPORT_MAX_LIMIT, Math.max(1, Math.trunc(v)))
}

export function parseExportCursor(raw: string | null | undefined): string {
  return (raw || '').trim()
}
