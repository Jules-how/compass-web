export const PROJECT_STATUSES = [
  'backlog',
  'planned',
  'in_progress',
  'completed',
  'canceled',
  // legacy values still accepted from desktop sync
  'active',
  'paused',
  'archived'
] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_BOARD_STATUSES = [
  'backlog',
  'planned',
  'in_progress',
  'completed',
  'canceled'
] as const

export type ProjectBoardStatus = (typeof PROJECT_BOARD_STATUSES)[number]

export const PROJECT_HEALTHS = ['no_updates', 'on_track', 'at_risk', 'off_track'] as const
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number]

export const PROJECT_PRIORITIES = [
  { value: 0, label: 'No priority' },
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' }
] as const

export function normalizeProjectStatus(status: string | null | undefined): ProjectBoardStatus {
  switch (status) {
    case 'planned':
    case 'paused':
      return 'planned'
    case 'in_progress':
    case 'active':
      return 'in_progress'
    case 'completed':
    case 'archived':
      return 'completed'
    case 'canceled':
    case 'cancelled':
      return 'canceled'
    case 'backlog':
    default:
      return 'backlog'
  }
}

export function projectStatusLabel(status: string | null | undefined): string {
  switch (normalizeProjectStatus(status)) {
    case 'planned':
      return 'Planned'
    case 'in_progress':
      return 'In Progress'
    case 'completed':
      return 'Completed'
    case 'canceled':
      return 'Canceled'
    case 'backlog':
    default:
      return 'Backlog'
  }
}

export function projectHealthLabel(health: string | null | undefined): string {
  switch (health) {
    case 'on_track':
      return 'On track'
    case 'at_risk':
      return 'At risk'
    case 'off_track':
      return 'Off track'
    case 'no_updates':
    default:
      return 'No updates'
  }
}

export function projectPriorityLabel(priority: number | null | undefined): string {
  return PROJECT_PRIORITIES.find((row) => row.value === priority)?.label ?? 'No priority'
}

export function formatProjectDate(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en-AU', { month: 'short', day: 'numeric' }).format(
      new Date(`${value}T00:00:00`)
    )
  } catch {
    return value
  }
}

/** Palette used for project icons / timeline accents. */
export const PROJECT_ICON_COLORS = [
  '#5B5FE8',
  '#D9487D',
  '#1FA971',
  '#D4A017',
  '#E85D2A',
  '#EB5757',
  '#7C6CF0',
  '#6B7C8F'
] as const

/** Neutral default when a project has no business function. */
export const DEFAULT_PROJECT_ICON_COLOR = '#95A2B3'

/**
 * Stable colors for known business functions.
 * Keys are normalized slugs (lowercase, hyphenated).
 */
const FUNCTION_ICON_COLOR_BY_KEY: Record<string, string> = {
  sales: '#E85D2A',
  sell: '#E85D2A',
  outbound: '#E85D2A',
  pipeline: '#E85D2A',
  crm: '#E85D2A',
  'client-deliveries': '#1FA971',
  'client-delivery': '#1FA971',
  deliveries: '#1FA971',
  delivery: '#1FA971',
  deliver: '#1FA971',
  fulfilment: '#1FA971',
  fulfillment: '#1FA971',
  build: '#5B5FE8',
  product: '#5B5FE8',
  systems: '#5B5FE8',
  'product-systems': '#5B5FE8',
  'product-and-systems': '#5B5FE8',
  engineering: '#5B5FE8',
  think: '#D4A017',
  strategy: '#D4A017',
  admin: '#6B7C8F',
  operations: '#6B7C8F',
  ops: '#6B7C8F',
  finances: '#6B7C8F',
  finance: '#6B7C8F',
  marketing: '#D9487D',
  growth: '#D9487D',
  brand: '#D9487D'
}

function normalizeFunctionKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function hashProjectIconColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return PROJECT_ICON_COLORS[hash % PROJECT_ICON_COLORS.length]
}

export type ProjectFunctionColorInput = {
  id?: string | null
  slug?: string | null
  name?: string | null
} | null | undefined

/**
 * Project icon / accent color from the owning business function.
 * Does not depend on the project name (so typing a title never reshuffles color).
 */
export function projectColorForFunction(fn: ProjectFunctionColorInput): string {
  if (!fn) return DEFAULT_PROJECT_ICON_COLOR

  const candidates = [fn.slug, fn.name]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map(normalizeFunctionKey)

  for (const key of candidates) {
    if (FUNCTION_ICON_COLOR_BY_KEY[key]) return FUNCTION_ICON_COLOR_BY_KEY[key]
  }

  // Partial matches: "Client Deliveries AU" → client-deliveries-au still hits "client-deliveries"
  const knownKeys = Object.keys(FUNCTION_ICON_COLOR_BY_KEY).sort((a, b) => b.length - a.length)
  for (const key of candidates) {
    for (const known of knownKeys) {
      if (key.startsWith(`${known}-`) || key.endsWith(`-${known}`)) {
        return FUNCTION_ICON_COLOR_BY_KEY[known]
      }
    }
  }

  const stableSeed = candidates[0] || fn.id || 'function'
  return hashProjectIconColor(stableSeed)
}
