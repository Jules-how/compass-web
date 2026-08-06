import { PROJECT_PRIORITIES, type ProjectHealth } from '@/lib/project-pm'

export const CLIENT_STATUSES = ['onboarding', 'active', 'paused'] as const
export type ClientStatus = (typeof CLIENT_STATUSES)[number]

export const CLIENT_CHANNELS = ['meta', 'google', 'other'] as const
export type ClientChannel = (typeof CLIENT_CHANNELS)[number]

export const CLIENT_OFFER_STATUSES = [
  'draft',
  'active',
  'paused',
  'won',
  'lost',
  'archived'
] as const
export type ClientOfferStatus = (typeof CLIENT_OFFER_STATUSES)[number]

export const CLIENT_ISSUE_STATUSES = [
  'not-started',
  'in-progress',
  'completed',
  'blocked',
  'cancelled'
] as const
export type ClientIssueStatus = (typeof CLIENT_ISSUE_STATUSES)[number]

export const CLIENT_PRIORITIES = PROJECT_PRIORITIES

export function normalizeClientStatus(status: string | null | undefined): ClientStatus {
  switch (status) {
    case 'active':
      return 'active'
    case 'paused':
      return 'paused'
    case 'prospect':
    case 'onboarding':
    default:
      // Legacy desktop sync used "prospect"; treat as onboarding in the web CRM.
      return 'onboarding'
  }
}

export function clientStatusLabel(status: string | null | undefined): string {
  switch (normalizeClientStatus(status)) {
    case 'active':
      return 'Active'
    case 'paused':
      return 'Paused'
    case 'onboarding':
    default:
      return 'Onboarding'
  }
}

export function clientIssueStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'in-progress':
      return 'In Progress'
    case 'completed':
      return 'Done'
    case 'blocked':
      return 'Blocked'
    case 'cancelled':
      return 'Cancelled'
    case 'not-started':
    default:
      return 'Todo'
  }
}

export function clientChannelLabel(channel: string | null | undefined): string {
  switch (channel) {
    case 'meta':
      return 'Meta'
    case 'google':
      return 'Google'
    case 'other':
      return 'Other'
    default:
      return channel || '—'
  }
}

export function clientOfferStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'paused':
      return 'Paused'
    case 'won':
      return 'Won'
    case 'lost':
      return 'Lost'
    case 'archived':
      return 'Archived'
    case 'draft':
    default:
      return 'Draft'
  }
}

export function isOpenClientIssue(status: string | null | undefined): boolean {
  return status !== 'completed' && status !== 'cancelled'
}

export function formatRelativeTouch(value: string | null | undefined): string {
  if (!value) return 'No activity yet'
  try {
    const then = new Date(value).getTime()
    if (!Number.isFinite(then)) return 'No activity yet'
    const diffMs = Date.now() - then
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return new Intl.DateTimeFormat('en-AU', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(value))
  } catch {
    return 'No activity yet'
  }
}

export function formatMoney(amount: number | null | undefined, currency = 'AUD'): string {
  if (amount == null || !Number.isFinite(Number(amount))) return '—'
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2
    }).format(Number(amount))
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`
  }
}

export type { ProjectHealth }
