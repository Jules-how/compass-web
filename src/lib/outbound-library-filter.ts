import { normalizeProvenance, type OutboundProvenance } from '@/lib/outbound-copy'

export type LibraryCampaignContext = {
  offer_key?: string | null
  vertical_tags?: string[]
  location_tags?: string[]
  structure_id?: string | null
}

export type LibraryScopedRow = {
  offer_key?: string | null
  vertical_tags?: string[]
  location_tags?: string[]
  structure_id?: string | null
  provenance?: OutboundProvenance | string | null
  label?: string | null
  body?: string | null
  notes?: string | null
  opener_mode?: string | null
}

const WEAK_LOCATION = new Set(['au-national'])

function tagSet(values: string[] | undefined | null): Set<string> {
  return new Set((values ?? []).map((tag) => tag.trim()).filter(Boolean))
}

/**
 * This campaign matcher.
 * Untagged rows fail. `au-national` alone is not a location match.
 * Subjects/openers have no location column — vertical overlap is enough.
 * National campaigns (no state tag) also match on vertical alone.
 */
export function matchesCampaignLibrary(
  row: LibraryScopedRow,
  ctx: LibraryCampaignContext,
  kind?: string
): boolean {
  if (kind === 'structures') return true
  if (ctx.offer_key && row.offer_key && row.offer_key === ctx.offer_key) return true

  const campaignVerticals = tagSet(ctx.vertical_tags)
  const campaignLocations = tagSet(ctx.location_tags)
  const rowVerticals = row.vertical_tags ?? []
  const rowLocations = row.location_tags ?? []
  const verticalHit = rowVerticals.some((tag) => campaignVerticals.has(tag))
  if (!verticalHit) return false

  if (kind === 'subjects' || kind === 'openers') return true

  const campaignHasStrongLocation = [...campaignLocations].some((tag) => !WEAK_LOCATION.has(tag))
  if (!campaignHasStrongLocation) return true
  if (rowLocations.length === 0) return true

  const locationHits = rowLocations.filter((tag) => campaignLocations.has(tag))
  return locationHits.some((tag) => !WEAK_LOCATION.has(tag))
}

export function passCampaignScope(
  row: LibraryScopedRow,
  ctx: LibraryCampaignContext,
  campaignOnly: boolean,
  kind?: string
): boolean {
  if (!campaignOnly) return true
  if (kind === 'structures') return true
  return matchesCampaignLibrary(row, ctx, kind)
}

export function sortLibraryRows<T extends LibraryScopedRow>(
  rows: T[],
  ctx: LibraryCampaignContext,
  kind?: string
): T[] {
  return [...rows].sort((a, b) => {
    const provA = normalizeProvenance(a.provenance)
    const provB = normalizeProvenance(b.provenance)
    if (provA !== provB) return provA === 'yours' ? -1 : 1
    return Number(matchesCampaignLibrary(b, ctx, kind)) - Number(matchesCampaignLibrary(a, ctx, kind))
  })
}

export function isDoctrineOpener(row: {
  label?: string | null
  body?: string | null
  notes?: string | null
}): boolean {
  const notes = (row.notes || '').toLowerCase()
  if (notes.includes('insertable:no')) return true
  const label = (row.label || '').toLowerCase()
  if (label.includes('mode:')) return true
  if (label.includes('reject')) return true
  const body = (row.body || '').trim()
  if (body.startsWith('[')) return true
  if (body.toLowerCase().includes('write a really short personalized')) return true
  if (body.toLowerCase().startsWith('clear the scammer')) return true
  return false
}

export const LIBRARY_BENCH_CAPS: Record<string, number> = {
  expressions: 2,
  ctas: 3,
  subjects: 3,
  openers: 3
}

export function applyLibraryBench<T>(kind: string, rows: T[], benchOn: boolean): T[] {
  if (!benchOn) return rows
  const cap = LIBRARY_BENCH_CAPS[kind]
  if (!cap) return rows
  return rows.slice(0, cap)
}
