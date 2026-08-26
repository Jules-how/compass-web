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

export function addInventoryCount(
  inventory: {
    all: number
    uncontacted: number
    uncontactedWithEmail: number
    byVertical: Map<
      string,
      {
        uncontacted: number
        uncontactedWithEmail: number
        withState: number
        blankState: number
        byState: Record<string, number>
      }
    >
  },
  row: {
    vertical?: string | null
    outbound_status?: string | null
    email?: string | null
    emailUsable?: boolean
    state?: string | null
  },
  n = 1
) {
  inventory.all += n
  const vertical = canonicalizeVertical(row.vertical)
  const bucket = inventory.byVertical.get(vertical) ?? {
    uncontacted: 0,
    uncontactedWithEmail: 0,
    withState: 0,
    blankState: 0,
    byState: {}
  }
  if ((row.outbound_status || '') === 'uncontacted') {
    inventory.uncontacted += n
    bucket.uncontacted += n
    const usable = row.emailUsable ?? hasUsableEmail(row.email)
    if (usable) {
      inventory.uncontactedWithEmail += n
      bucket.uncontactedWithEmail += n
      const state = canonicalizeState(row.state)
      if (state === '(blank)') bucket.blankState += n
      else {
        bucket.withState += n
        bucket.byState[state] = (bucket.byState[state] || 0) + n
      }
    }
  }
  inventory.byVertical.set(vertical, bucket)
}

export function finishLeadInventory(partial: {
  all: number
  uncontacted: number
  uncontactedWithEmail: number
  byVertical: Map<
    string,
    {
      uncontacted: number
      uncontactedWithEmail: number
      withState: number
      blankState: number
      byState: Record<string, number>
    }
  >
}): LeadInventoryPayload {
  const list: InventoryVerticalRow[] = [...partial.byVertical.entries()]
    .map(([vertical, v]) => ({ vertical, ...v }))
    .sort(
      (a, b) =>
        b.uncontactedWithEmail - a.uncontactedWithEmail ||
        b.uncontacted - a.uncontacted ||
        a.vertical.localeCompare(b.vertical)
    )

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      all: partial.all,
      uncontacted: partial.uncontacted,
      uncontactedWithEmail: partial.uncontactedWithEmail
    },
    byVertical: list
  }
}

export function buildLeadInventory(
  rows: Array<{
    vertical?: string | null
    outbound_status?: string | null
    email?: string | null
    state?: string | null
  }>
): LeadInventoryPayload {
  const partial = {
    all: 0,
    uncontacted: 0,
    uncontactedWithEmail: 0,
    byVertical: new Map<
      string,
      {
        uncontacted: number
        uncontactedWithEmail: number
        withState: number
        blankState: number
        byState: Record<string, number>
      }
    >()
  }
  for (const row of rows) addInventoryCount(partial, row, 1)
  return finishLeadInventory(partial)
}
