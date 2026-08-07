/** Operator outbound targeting map — where you've contacted people and where success concentrates. */

export type TargetingOutcome =
  | 'converted'
  | 'booked'
  | 'interested'
  | 'replied'
  | 'contacted'
  | 'other'

export type TargetingMapPoint = {
  /** Stable location key, e.g. "sydney|nsw". */
  key: string
  label: string
  city: string | null
  state: string | null
  /** WGS84; null when the place is unknown to the gazetteer. */
  lat: number | null
  lng: number | null
  targeted: number
  successes: number
  replies: number
  successRate: number
  /** 0–1 heat used for marker fill (success-weighted). */
  heat: number
  byOutcome: Record<TargetingOutcome, number>
}

export type TargetingMapModel = {
  points: TargetingMapPoint[]
  totals: {
    targeted: number
    successes: number
    replies: number
    located: number
    missingLocation: number
    successRate: number
  }
  source: 'live' | 'demo'
}

export type TargetingMapLeadRow = {
  city?: string | null
  state?: string | null
  outbound_status?: string | null
}

/** Approximate city / region coordinates for map pins (AU-first, then common outbound markets). */
const GEO_POINTS: Array<{ key: string; aliases: string[]; lat: number; lng: number }> = [
  { key: 'sydney', aliases: ['sydney', 'sydney nsw', 'parramatta', 'north sydney'], lat: -33.8688, lng: 151.2093 },
  { key: 'melbourne', aliases: ['melbourne', 'melbourne vic', 'south yarra'], lat: -37.8136, lng: 144.9631 },
  { key: 'brisbane', aliases: ['brisbane', 'brisbane qld', 'south brisbane'], lat: -27.4698, lng: 153.0251 },
  { key: 'perth', aliases: ['perth', 'perth wa'], lat: -31.9505, lng: 115.8605 },
  { key: 'adelaide', aliases: ['adelaide', 'adelaide sa'], lat: -34.9285, lng: 138.6007 },
  { key: 'gold coast', aliases: ['gold coast', 'gold coast qld', 'surfers paradise'], lat: -28.0167, lng: 153.4 },
  { key: 'canberra', aliases: ['canberra', 'canberra act'], lat: -35.2809, lng: 149.13 },
  { key: 'newcastle', aliases: ['newcastle', 'newcastle nsw'], lat: -32.9283, lng: 151.7817 },
  { key: 'hobart', aliases: ['hobart', 'hobart tas'], lat: -42.8821, lng: 147.3272 },
  { key: 'auckland', aliases: ['auckland'], lat: -36.8509, lng: 174.7645 },
  { key: 'wellington', aliases: ['wellington'], lat: -41.2865, lng: 174.7762 },
  { key: 'london', aliases: ['london', 'london uk'], lat: 51.5074, lng: -0.1278 },
  { key: 'manchester', aliases: ['manchester'], lat: 53.4808, lng: -2.2426 },
  { key: 'new york', aliases: ['new york', 'new york city', 'nyc', 'brooklyn'], lat: 40.7128, lng: -74.006 },
  { key: 'san francisco', aliases: ['san francisco', 'sf', 'bay area'], lat: 37.7749, lng: -122.4194 },
  { key: 'los angeles', aliases: ['los angeles', 'la', 'santa monica'], lat: 34.0522, lng: -118.2437 },
  { key: 'austin', aliases: ['austin', 'austin tx'], lat: 30.2672, lng: -97.7431 },
  { key: 'miami', aliases: ['miami', 'miami fl'], lat: 25.7617, lng: -80.1918 },
  { key: 'toronto', aliases: ['toronto'], lat: 43.6532, lng: -79.3832 },
  { key: 'singapore', aliases: ['singapore'], lat: 1.3521, lng: 103.8198 }
]

const STATE_CENTROIDS: Array<{ key: string; aliases: string[]; lat: number; lng: number; label: string }> = [
  { key: 'nsw', aliases: ['nsw', 'new south wales'], lat: -32.5, lng: 147.0, label: 'NSW' },
  { key: 'vic', aliases: ['vic', 'victoria'], lat: -37.0, lng: 144.5, label: 'Victoria' },
  { key: 'qld', aliases: ['qld', 'queensland'], lat: -23.0, lng: 145.0, label: 'Queensland' },
  { key: 'wa', aliases: ['wa', 'western australia'], lat: -26.0, lng: 121.0, label: 'Western Australia' },
  { key: 'sa', aliases: ['sa', 'south australia'], lat: -32.0, lng: 136.0, label: 'South Australia' },
  { key: 'tas', aliases: ['tas', 'tasmania'], lat: -42.0, lng: 147.0, label: 'Tasmania' },
  { key: 'act', aliases: ['act', 'australian capital territory'], lat: -35.3, lng: 149.1, label: 'ACT' },
  { key: 'nt', aliases: ['nt', 'northern territory'], lat: -19.0, lng: 133.0, label: 'Northern Territory' },
  { key: 'california', aliases: ['ca', 'california'], lat: 36.7783, lng: -119.4179, label: 'California' },
  { key: 'texas', aliases: ['tx', 'texas'], lat: 31.9686, lng: -99.9018, label: 'Texas' },
  { key: 'new york state', aliases: ['ny', 'new york state'], lat: 43.0, lng: -75.0, label: 'New York' },
  { key: 'florida', aliases: ['fl', 'florida'], lat: 27.6648, lng: -81.5158, label: 'Florida' }
]

const EMPTY_OUTCOMES: Record<TargetingOutcome, number> = {
  converted: 0,
  booked: 0,
  interested: 0,
  replied: 0,
  contacted: 0,
  other: 0
}

export function normalizePlace(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function classifyOutboundOutcome(status: string | null | undefined): TargetingOutcome {
  const s = (status ?? '').trim().toLowerCase()
  if (s === 'converted') return 'converted'
  if (s === 'booked' || s === 'meeting_booked') return 'booked'
  if (s === 'interested') return 'interested'
  if (s === 'replied') return 'replied'
  if (s === 'contacted' || s === 'uncontacted') return 'contacted'
  if (s === 'not_interested' || s === 'suppressed') return 'other'
  if (!s) return 'contacted'
  return 'other'
}

export function isSuccessOutcome(outcome: TargetingOutcome): boolean {
  return outcome === 'converted' || outcome === 'booked' || outcome === 'interested'
}

export function isReplyOutcome(outcome: TargetingOutcome): boolean {
  return isSuccessOutcome(outcome) || outcome === 'replied'
}

function titleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function resolveGeo(city: string | null, state: string | null): {
  lat: number | null
  lng: number | null
} {
  const cityKey = normalizePlace(city)
  const stateKey = normalizePlace(state)
  const combined = [cityKey, stateKey].filter(Boolean).join(' ')

  for (const point of GEO_POINTS) {
    if (point.aliases.some((alias) => cityKey === alias || combined === alias || combined.startsWith(`${alias} `))) {
      return { lat: point.lat, lng: point.lng }
    }
  }

  for (const region of STATE_CENTROIDS) {
    if (region.aliases.some((alias) => stateKey === alias || cityKey === alias)) {
      return { lat: region.lat, lng: region.lng }
    }
  }

  return { lat: null, lng: null }
}

export function locationKey(city: string | null, state: string | null): string | null {
  const c = normalizePlace(city)
  const s = normalizePlace(state)
  if (!c && !s) return null
  return `${c || '_'}|${s || '_'}`
}

export function locationLabel(city: string | null, state: string | null): string {
  const c = (city ?? '').trim()
  const s = (state ?? '').trim()
  if (c && s) return `${titleCase(c)}, ${s.toUpperCase().length <= 3 ? s.toUpperCase() : titleCase(s)}`
  if (c) return titleCase(c)
  if (s) return s.toUpperCase().length <= 3 ? s.toUpperCase() : titleCase(s)
  return 'Unknown'
}

/**
 * Aggregate lead rows into a targeting/success map model.
 * Heat ranks places by success volume, with a nudge for high success rate.
 */
export function buildTargetingMap(
  rows: TargetingMapLeadRow[],
  options?: { limit?: number; source?: 'live' | 'demo' }
): TargetingMapModel {
  const limit = options?.limit ?? 40
  type Acc = {
    city: string | null
    state: string | null
    labelCounts: Map<string, number>
    targeted: number
    successes: number
    replies: number
    byOutcome: Record<TargetingOutcome, number>
  }

  const buckets = new Map<string, Acc>()
  let missingLocation = 0

  for (const row of rows) {
    const key = locationKey(row.city ?? null, row.state ?? null)
    if (!key) {
      missingLocation += 1
      continue
    }
    const outcome = classifyOutboundOutcome(row.outbound_status)
    let acc = buckets.get(key)
    if (!acc) {
      acc = {
        city: row.city?.trim() || null,
        state: row.state?.trim() || null,
        labelCounts: new Map(),
        targeted: 0,
        successes: 0,
        replies: 0,
        byOutcome: { ...EMPTY_OUTCOMES }
      }
      buckets.set(key, acc)
    }
    const label = locationLabel(row.city ?? null, row.state ?? null)
    acc.labelCounts.set(label, (acc.labelCounts.get(label) ?? 0) + 1)
    acc.targeted += 1
    acc.byOutcome[outcome] += 1
    if (isSuccessOutcome(outcome)) acc.successes += 1
    if (isReplyOutcome(outcome)) acc.replies += 1
  }

  const rawPoints: TargetingMapPoint[] = Array.from(buckets.entries()).map(([key, acc]) => {
    let label = locationLabel(acc.city, acc.state)
    let best = 0
    for (const [candidate, count] of acc.labelCounts) {
      if (count > best) {
        best = count
        label = candidate
      }
    }
    const geo = resolveGeo(acc.city, acc.state)
    const successRate = acc.targeted > 0 ? acc.successes / acc.targeted : 0
    return {
      key,
      label,
      city: acc.city,
      state: acc.state,
      lat: geo.lat,
      lng: geo.lng,
      targeted: acc.targeted,
      successes: acc.successes,
      replies: acc.replies,
      successRate,
      heat: 0,
      byOutcome: { ...acc.byOutcome }
    }
  })

  const targeted = rows.length - missingLocation
  const maxSuccess = Math.max(0, ...rawPoints.map((p) => p.successes))
  const maxTargeted = Math.max(0, ...rawPoints.map((p) => p.targeted))

  for (const point of rawPoints) {
    const successShare = maxSuccess > 0 ? point.successes / maxSuccess : 0
    const volumeShare = maxTargeted > 0 ? point.targeted / maxTargeted : 0
    // Prefer places with real wins; volume still shows where you spend effort.
    point.heat = Math.min(1, successShare * 0.75 + volumeShare * 0.25 + point.successRate * 0.15)
  }

  const points = rawPoints
    .sort(
      (a, b) =>
        b.successes - a.successes ||
        b.successRate - a.successRate ||
        b.targeted - a.targeted ||
        a.label.localeCompare(b.label)
    )
    .slice(0, Math.max(1, limit))

  let allSuccesses = 0
  let allReplies = 0
  let allTargeted = 0
  for (const acc of buckets.values()) {
    allTargeted += acc.targeted
    allSuccesses += acc.successes
    allReplies += acc.replies
  }

  return {
    points,
    totals: {
      targeted: allTargeted || targeted,
      successes: allSuccesses,
      replies: allReplies,
      located: buckets.size,
      missingLocation,
      successRate: allTargeted > 0 ? allSuccesses / allTargeted : 0
    },
    source: options?.source ?? 'live'
  }
}

/** Equirectangular projection into an SVG viewBox. */
export function projectLatLng(
  lat: number,
  lng: number,
  view: { x: number; y: number; width: number; height: number } = {
    x: 0,
    y: 0,
    width: 1000,
    height: 520
  }
): { x: number; y: number } {
  const x = view.x + ((lng + 180) / 360) * view.width
  const y = view.y + ((90 - lat) / 180) * view.height
  return { x, y }
}

export function targetingHeatFill(heat: number): string {
  const t = Math.max(0, Math.min(1, heat))
  const r = Math.round(253 + (232 - 253) * t)
  const g = Math.round(186 + (93 - 186) * t)
  const b = Math.round(116 + (42 - 116) * t)
  const a = 0.35 + t * 0.55
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
}

export const TARGETING_MAP_DEMO_ROWS: TargetingMapLeadRow[] = [
  ...Array.from({ length: 48 }, () => ({ city: 'Sydney', state: 'NSW', outbound_status: 'contacted' })),
  ...Array.from({ length: 14 }, () => ({ city: 'Sydney', state: 'NSW', outbound_status: 'replied' })),
  ...Array.from({ length: 9 }, () => ({ city: 'Sydney', state: 'NSW', outbound_status: 'interested' })),
  ...Array.from({ length: 6 }, () => ({ city: 'Sydney', state: 'NSW', outbound_status: 'booked' })),
  ...Array.from({ length: 3 }, () => ({ city: 'Sydney', state: 'NSW', outbound_status: 'converted' })),
  ...Array.from({ length: 36 }, () => ({ city: 'Melbourne', state: 'VIC', outbound_status: 'contacted' })),
  ...Array.from({ length: 8 }, () => ({ city: 'Melbourne', state: 'VIC', outbound_status: 'replied' })),
  ...Array.from({ length: 4 }, () => ({ city: 'Melbourne', state: 'VIC', outbound_status: 'interested' })),
  ...Array.from({ length: 2 }, () => ({ city: 'Melbourne', state: 'VIC', outbound_status: 'booked' })),
  ...Array.from({ length: 28 }, () => ({ city: 'Brisbane', state: 'QLD', outbound_status: 'contacted' })),
  ...Array.from({ length: 5 }, () => ({ city: 'Brisbane', state: 'QLD', outbound_status: 'replied' })),
  ...Array.from({ length: 1 }, () => ({ city: 'Brisbane', state: 'QLD', outbound_status: 'interested' })),
  ...Array.from({ length: 22 }, () => ({ city: 'Austin', state: 'TX', outbound_status: 'contacted' })),
  ...Array.from({ length: 7 }, () => ({ city: 'Austin', state: 'TX', outbound_status: 'replied' })),
  ...Array.from({ length: 5 }, () => ({ city: 'Austin', state: 'TX', outbound_status: 'interested' })),
  ...Array.from({ length: 3 }, () => ({ city: 'Austin', state: 'TX', outbound_status: 'booked' })),
  ...Array.from({ length: 18 }, () => ({ city: 'San Francisco', state: 'CA', outbound_status: 'contacted' })),
  ...Array.from({ length: 4 }, () => ({ city: 'San Francisco', state: 'CA', outbound_status: 'replied' })),
  ...Array.from({ length: 2 }, () => ({ city: 'San Francisco', state: 'CA', outbound_status: 'booked' })),
  ...Array.from({ length: 12 }, () => ({ city: 'London', state: 'UK', outbound_status: 'contacted' })),
  ...Array.from({ length: 3 }, () => ({ city: 'London', state: 'UK', outbound_status: 'interested' })),
  ...Array.from({ length: 10 }, () => ({ city: 'Perth', state: 'WA', outbound_status: 'contacted' })),
  ...Array.from({ length: 1 }, () => ({ city: 'Perth', state: 'WA', outbound_status: 'replied' })),
  ...Array.from({ length: 8 }, () => ({ city: null, state: null, outbound_status: 'contacted' }))
]

export function buildDemoTargetingMap(): TargetingMapModel {
  return buildTargetingMap(TARGETING_MAP_DEMO_ROWS, { source: 'demo', limit: 20 })
}
