/** Aggregate free-text Meta ad-set location targeting into a heatmap model. */

export type LocationHeatStatus = 'active' | 'paused' | 'draft' | 'archived'

export type LocationHeatCell = {
  status: LocationHeatStatus
  count: number
}

export type LocationHeatRow = {
  /** Normalized key used for grouping. */
  key: string
  /** Best display label (most common casing among inputs). */
  label: string
  /** Total ad sets that include this location token. */
  total: number
  /** Intensity 0–1 relative to the hottest location in the set. */
  intensity: number
  byStatus: Record<LocationHeatStatus, number>
}

export type LocationHeatmapModel = {
  rows: LocationHeatRow[]
  statuses: LocationHeatStatus[]
  maxTotal: number
  adSetsWithLocations: number
  adSetsMissingLocations: number
  uniqueLocations: number
}

export type LocationHeatmapSource = {
  locations: string | null | undefined
  status?: string | null | undefined
}

const STATUS_ORDER: LocationHeatStatus[] = ['active', 'paused', 'draft', 'archived']

const SPLIT_RE = /\s*(?:[·•|/]|;|\n|,|\band\b)\s*/i

export function parseLocationTokens(raw: string | null | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(SPLIT_RE)) {
    const token = part.replace(/\s+/g, ' ').trim()
    if (!token) continue
    const key = normalizeLocationKey(token)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(token)
  }
  return out
}

export function normalizeLocationKey(token: string): string {
  return token.replace(/\s+/g, ' ').trim().toLowerCase()
}

function normalizeStatus(status: string | null | undefined): LocationHeatStatus {
  if (status === 'active' || status === 'paused' || status === 'archived') return status
  return 'draft'
}

/**
 * Build a ranked heatmap of location tokens across ad sets.
 * Each ad set contributes at most once per distinct location token.
 */
export function buildLocationHeatmap(
  sources: LocationHeatmapSource[],
  options?: { limit?: number }
): LocationHeatmapModel {
  const limit = options?.limit ?? 12
  type Acc = {
    labelCounts: Map<string, number>
    byStatus: Record<LocationHeatStatus, number>
    total: number
  }

  const buckets = new Map<string, Acc>()
  let adSetsWithLocations = 0
  let adSetsMissingLocations = 0

  for (const source of sources) {
    const tokens = parseLocationTokens(source.locations)
    if (tokens.length === 0) {
      adSetsMissingLocations += 1
      continue
    }
    adSetsWithLocations += 1
    const status = normalizeStatus(source.status)
    const used = new Set<string>()
    for (const token of tokens) {
      const key = normalizeLocationKey(token)
      if (!key || used.has(key)) continue
      used.add(key)
      let acc = buckets.get(key)
      if (!acc) {
        acc = {
          labelCounts: new Map(),
          byStatus: { active: 0, paused: 0, draft: 0, archived: 0 },
          total: 0
        }
        buckets.set(key, acc)
      }
      acc.total += 1
      acc.byStatus[status] += 1
      acc.labelCounts.set(token, (acc.labelCounts.get(token) ?? 0) + 1)
    }
  }

  const maxTotal = Math.max(0, ...Array.from(buckets.values(), (b) => b.total))

  const rows: LocationHeatRow[] = Array.from(buckets.entries())
    .map(([key, acc]) => {
      let label = key
      let best = 0
      for (const [candidate, count] of acc.labelCounts) {
        if (count > best) {
          best = count
          label = candidate
        }
      }
      return {
        key,
        label,
        total: acc.total,
        intensity: maxTotal > 0 ? acc.total / maxTotal : 0,
        byStatus: { ...acc.byStatus }
      }
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, limit))

  // Re-scale intensity against the visible set's max so the chart still reads well when truncated.
  const visibleMax = rows[0]?.total ?? 0
  for (const row of rows) {
    row.intensity = visibleMax > 0 ? row.total / visibleMax : 0
  }

  return {
    rows,
    statuses: STATUS_ORDER,
    maxTotal: visibleMax,
    adSetsWithLocations,
    adSetsMissingLocations,
    uniqueLocations: buckets.size
  }
}

/** Map intensity 0–1 to a warm stone→accent fill suitable for light UI. */
export function locationHeatFill(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity))
  // Blend stone-100 → accent orange.
  const r = Math.round(245 + (232 - 245) * t)
  const g = Math.round(245 + (93 - 245) * t)
  const b = Math.round(244 + (42 - 244) * t)
  const a = 0.35 + t * 0.65
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
}

export function locationHeatTextClass(intensity: number): string {
  return intensity >= 0.55 ? 'text-white' : 'text-neutral-800'
}
