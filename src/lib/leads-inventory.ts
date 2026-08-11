/** Canonical vertical inventory for agent orient endpoints. */

import { normalizeVerticalSlug, slugifyVerticalKey } from '@/lib/leads-meta'

const EXTRA_ALIASES: Record<string, string> = {
  broker: 'mortgage-brokers',
  brokers: 'mortgage-brokers',
  'mortgage broker': 'mortgage-brokers',
  'mortgage brokers': 'mortgage-brokers',
  electrician: 'electrician',
  electricians: 'electrician',
  electrical: 'electrician',
  plumber: 'plumber',
  plumbers: 'plumber',
  plumbing: 'plumber',
  agency: 'agency',
  agencies: 'agency',
  'marketing agency': 'agency',
  'marketing agencies': 'agency',
  'digital agency': 'agency',
  'digital agencies': 'agency',
  recruitment: 'recruitment',
  recruiting: 'recruitment',
  recruiters: 'recruitment',
  recruiter: 'recruitment',
  trades: 'trades',
  trade: 'trades',
  tradies: 'trades',
  tradie: 'trades',
  hvac: 'hvac',
  'med spa': 'med-spas',
  'med spas': 'med-spas',
  medspa: 'med-spas',
  'med-spas': 'med-spas'
}

export function canonicalizeVertical(raw: string | null | undefined): string {
  const trimmed = (raw || '').trim()
  if (!trimmed) return '(blank)'
  const lower = trimmed.toLowerCase()
  if (EXTRA_ALIASES[lower]) return EXTRA_ALIASES[lower]
  const fromTaxonomy = normalizeVerticalSlug(trimmed)
  if (fromTaxonomy) return fromTaxonomy
  return slugifyVerticalKey(trimmed) || '(blank)'
}

export function canonicalizeState(raw: string | null | undefined): string {
  const t = (raw || '').trim()
  if (!t) return '(blank)'
  const lower = t.toLowerCase()
  if (lower === 'nsw' || lower === 'new south wales') return 'NSW'
  if (lower === 'vic' || lower === 'victoria') return 'VIC'
  if (lower === 'qld' || lower === 'queensland') return 'QLD'
  if (lower === 'wa' || lower === 'western australia') return 'WA'
  if (lower === 'sa' || lower === 'south australia') return 'SA'
  if (lower === 'tas' || lower === 'tasmania') return 'TAS'
  if (lower === 'act' || lower === 'australian capital territory') return 'ACT'
  if (lower === 'nt' || lower === 'northern territory') return 'NT'
  return t.toUpperCase().length <= 3 ? t.toUpperCase() : t
}

export function hasUsableEmail(email: string | null | undefined): boolean {
  const e = email || ''
  return e.includes('@') && e.includes('.') && !e.includes(' ')
}

export type InventoryVerticalRow = {
  vertical: string
  uncontacted: number
  uncontactedWithEmail: number
  withState: number
  blankState: number
  byState: Record<string, number>
}

export type LeadInventoryPayload = {
  generatedAt: string
  totals: {
    all: number
    uncontacted: number
    uncontactedWithEmail: number
  }
  byVertical: InventoryVerticalRow[]
}

export function buildLeadInventory(
  rows: Array<{
    vertical?: string | null
    outbound_status?: string | null
    email?: string | null
    state?: string | null
  }>
): LeadInventoryPayload {
  const byVertical = new Map<
    string,
    {
      uncontacted: number
      uncontactedWithEmail: number
      withState: number
      blankState: number
      byState: Record<string, number>
    }
  >()

  let all = 0
  let uncontacted = 0
  let uncontactedWithEmail = 0

  for (const row of rows) {
    all += 1
    const vertical = canonicalizeVertical(row.vertical)
    const bucket = byVertical.get(vertical) ?? {
      uncontacted: 0,
      uncontactedWithEmail: 0,
      withState: 0,
      blankState: 0,
      byState: {}
    }
    if ((row.outbound_status || '') === 'uncontacted') {
      uncontacted += 1
      bucket.uncontacted += 1
      if (hasUsableEmail(row.email)) {
        uncontactedWithEmail += 1
        bucket.uncontactedWithEmail += 1
        const state = canonicalizeState(row.state)
        if (state === '(blank)') bucket.blankState += 1
        else {
          bucket.withState += 1
          bucket.byState[state] = (bucket.byState[state] || 0) + 1
        }
      }
    }
    byVertical.set(vertical, bucket)
  }

  const list: InventoryVerticalRow[] = [...byVertical.entries()]
    .map(([vertical, v]) => ({ vertical, ...v }))
    .sort(
      (a, b) =>
        b.uncontactedWithEmail - a.uncontactedWithEmail ||
        b.uncontacted - a.uncontacted ||
        a.vertical.localeCompare(b.vertical)
    )

  return {
    generatedAt: new Date().toISOString(),
    totals: { all, uncontacted, uncontactedWithEmail },
    byVertical: list
  }
}
