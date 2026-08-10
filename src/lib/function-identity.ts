import {
  DEFAULT_PROJECT_ICON_COLOR,
  projectColorForFunction,
  type ProjectFunctionColorInput
} from '@/lib/project-pm'

export type FunctionKind =
  | 'sales'
  | 'marketing'
  | 'product'
  | 'delivery'
  | 'strategy'
  | 'operations'
  | 'generic'

export type FunctionIdentityInput = ProjectFunctionColorInput

const KIND_BY_KEY: Record<string, FunctionKind> = {
  sales: 'sales',
  sell: 'sales',
  outbound: 'sales',
  pipeline: 'sales',
  crm: 'sales',
  marketing: 'marketing',
  growth: 'marketing',
  brand: 'marketing',
  product: 'product',
  systems: 'product',
  'product-systems': 'product',
  'product-and-systems': 'product',
  build: 'product',
  engineering: 'product',
  'client-deliveries': 'delivery',
  'client-delivery': 'delivery',
  deliveries: 'delivery',
  delivery: 'delivery',
  deliver: 'delivery',
  fulfilment: 'delivery',
  fulfillment: 'delivery',
  think: 'strategy',
  strategy: 'strategy',
  admin: 'operations',
  operations: 'operations',
  ops: 'operations',
  finances: 'operations',
  finance: 'operations'
}

function normalizeFunctionKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function candidatesFor(fn: FunctionIdentityInput): string[] {
  if (!fn) return []
  return [fn.slug, fn.name]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map(normalizeFunctionKey)
}

/** Accent color for a business function (shared with project icons). */
export function functionAccentColor(fn: FunctionIdentityInput): string {
  return projectColorForFunction(fn) || DEFAULT_PROJECT_ICON_COLOR
}

/** Stable visual kind used to pick a unique logo. */
export function resolveFunctionKind(fn: FunctionIdentityInput): FunctionKind {
  const candidates = candidatesFor(fn)

  for (const key of candidates) {
    if (KIND_BY_KEY[key]) return KIND_BY_KEY[key]
  }

  for (const key of candidates) {
    for (const [known, kind] of Object.entries(KIND_BY_KEY)) {
      if (key === known || key.startsWith(`${known}-`) || key.endsWith(`-${known}`)) {
        return kind
      }
    }
  }

  return 'generic'
}

/** Hex → rgba string for soft washes / wells. */
export function withAlpha(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim()
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => `${ch}${ch}`)
          .join('')
      : raw
  if (full.length !== 6) return `rgba(15, 18, 23, ${alpha})`
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(15, 18, 23, ${alpha})`
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
