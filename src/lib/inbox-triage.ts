import type { CompassTask, LeadContact } from '@/lib/types'
import type { InboundLeadChannel } from '@/lib/inbound-leads-ui'

export const INBOX_TRIAGE_STATES = ['unread', 'read', 'done', 'snoozed'] as const
export type InboxTriageState = (typeof INBOX_TRIAGE_STATES)[number]

export const INBOX_CHANNELS = ['agents', 'instantly', 'leads'] as const
export type InboxChannel = (typeof INBOX_CHANNELS)[number]

export const LEAD_LIFECYCLE_STATUSES = ['new', 'contacted', 'qualified', 'discarded'] as const
export type LeadLifecycleStatus = (typeof LEAD_LIFECYCLE_STATUSES)[number]

export type InboxTriageRow = {
  id: string
  channel: InboxChannel
  source_id: string
  triage: InboxTriageState
  snoozed_until: string | null
  identity_key: string | null
  updated_at: string
  created_at: string
}

export type TriageLookup = Map<string, InboxTriageRow>

export function triageKey(channel: InboxChannel, sourceId: string): string {
  return `${channel}:${sourceId}`
}

export function parseInboxTriage(value: unknown): InboxTriageState | null {
  if (typeof value !== 'string') return null
  return (INBOX_TRIAGE_STATES as readonly string[]).includes(value)
    ? (value as InboxTriageState)
    : null
}

export function parseLeadLifecycle(value: unknown): LeadLifecycleStatus | null {
  if (typeof value !== 'string') return null
  return (LEAD_LIFECYCLE_STATUSES as readonly string[]).includes(value)
    ? (value as LeadLifecycleStatus)
    : null
}

export function parseInboxChannel(value: unknown): InboxChannel | null {
  if (typeof value !== 'string') return null
  return (INBOX_CHANNELS as readonly string[]).includes(value) ? (value as InboxChannel) : null
}

/** Normalize email (or fallback phone) into a stable cross-channel identity. */
export function inboxIdentityKey(email?: string | null, phone?: string | null): string | null {
  const normalizedEmail = (email ?? '').trim().toLowerCase()
  if (normalizedEmail && normalizedEmail.includes('@')) return `email:${normalizedEmail}`
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length >= 8) return `phone:${digits}`
  return null
}

export function isTriageActionable(
  triage: InboxTriageState | null | undefined,
  snoozedUntil: string | null | undefined,
  now = Date.now()
): boolean {
  const state = triage ?? 'unread'
  if (state === 'done') return false
  if (state === 'snoozed') {
    if (!snoozedUntil) return false
    const until = Date.parse(snoozedUntil)
    if (Number.isNaN(until)) return false
    return until <= now
  }
  return true
}

export function effectiveTriage(
  triage: InboxTriageState | null | undefined,
  snoozedUntil: string | null | undefined,
  now = Date.now()
): InboxTriageState {
  const state = triage ?? 'unread'
  if (state === 'snoozed' && snoozedUntil) {
    const until = Date.parse(snoozedUntil)
    if (!Number.isNaN(until) && until <= now) return 'unread'
  }
  return state
}

export function isUnreadTriage(
  triage: InboxTriageState | null | undefined,
  snoozedUntil: string | null | undefined,
  now = Date.now()
): boolean {
  return effectiveTriage(triage, snoozedUntil, now) === 'unread'
}

/** Agents: blocked tasks always qualify; completions are review-only (not badge). */
export function isAgentBlockedTask(task: Pick<CompassTask, 'status' | 'parent_task_id'>): boolean {
  return !task.parent_task_id && task.status === 'blocked'
}

export function isAgentCompletedReviewTask(
  task: Pick<CompassTask, 'status' | 'parent_task_id' | 'updated_at'>,
  now = Date.now(),
  windowMs = 14 * 24 * 60 * 60 * 1000
): boolean {
  if (task.parent_task_id || task.status !== 'completed') return false
  const updated = Date.parse(task.updated_at)
  if (Number.isNaN(updated)) return false
  return now - updated <= windowMs
}

export function isAgentAttentionTask(
  task: Pick<CompassTask, 'status' | 'parent_task_id' | 'updated_at'>,
  now = Date.now()
): boolean {
  return isAgentBlockedTask(task) || isAgentCompletedReviewTask(task, now)
}

export function isInstantlyInboundLead(lead: Pick<LeadContact, 'outbound_status'>): boolean {
  const status = (lead.outbound_status || '').toLowerCase()
  return status === 'replied' || status === 'interested' || status === 'meeting_booked'
}

export function instantlyStatusWeight(status: string | null | undefined): number {
  switch ((status || '').toLowerCase()) {
    case 'meeting_booked':
      return 100
    case 'interested':
      return 80
    case 'replied':
      return 55
    default:
      return 40
  }
}

export function leadChannelWeight(channel: InboundLeadChannel | string | null | undefined): number {
  switch (channel) {
    case 'meta':
      return 72
    case 'website':
      return 68
    case 'guide':
      return 60
    default:
      return 50
  }
}

export function leadLifecycleWeight(status: LeadLifecycleStatus | null | undefined): number {
  switch (status ?? 'new') {
    case 'new':
      return 12
    case 'contacted':
      return 4
    case 'qualified':
      return 8
    case 'discarded':
      return -100
    default:
      return 0
  }
}

function ageDecayHours(occurredAt: string, now = Date.now()): number {
  const ts = Date.parse(occurredAt)
  if (Number.isNaN(ts)) return 24
  return Math.max(0, (now - ts) / (60 * 60 * 1000))
}

export type InboxRankInput = {
  tab: InboxChannel
  occurredAt: string
  agentStatus?: string | null
  instantlyStatus?: string | null
  leadChannel?: string | null
  lifecycle?: LeadLifecycleStatus | null
  unread?: boolean
}

/** Explainable priority score — higher = surface first. */
export function scoreInboxItem(input: InboxRankInput, now = Date.now()): number {
  let score = 0
  if (input.tab === 'agents') {
    score += input.agentStatus === 'blocked' ? 92 : 28
  } else if (input.tab === 'instantly') {
    score += instantlyStatusWeight(input.instantlyStatus)
  } else {
    score += leadChannelWeight(input.leadChannel)
    score += leadLifecycleWeight(input.lifecycle)
  }

  const hours = ageDecayHours(input.occurredAt, now)
  if (hours < 6) score += 10
  else if (hours < 24) score += 6
  else if (hours < 72) score += 2
  else if (hours > 168) score -= 8

  if (input.unread) score += 5
  return score
}

export function isLeadLifecycleActionable(status: LeadLifecycleStatus | null | undefined): boolean {
  const value = status ?? 'new'
  return value === 'new' || value === 'contacted' || value === 'qualified'
}

export function buildTriageLookup(rows: InboxTriageRow[]): TriageLookup {
  const map: TriageLookup = new Map()
  for (const row of rows) {
    map.set(triageKey(row.channel, row.source_id), row)
  }
  return map
}

export function newTriageId(channel: InboxChannel, sourceId: string): string {
  return `triage_${channel}_${sourceId}`
}

export type InboxSuggestInput = {
  tab: InboxChannel
  title: string
  preview?: string | null
  body?: string | null
  email?: string | null
  phone?: string | null
  agentStatus?: string | null
  instantlyStatus?: string | null
  lifecycle?: LeadLifecycleStatus | null
  sourceLabel?: string | null
}

export type InboxSuggestion = {
  nextStep: string
  rationale: string
  source: 'heuristic' | 'ai'
}

/** Deterministic next-step copy for the detail pane (AI may refine later). */
export function suggestInboxNextStep(input: InboxSuggestInput): InboxSuggestion {
  if (input.tab === 'agents') {
    if (input.agentStatus === 'blocked') {
      return {
        nextStep: 'Unblock this agent task — clear the blocker or re-assign ownership.',
        rationale: 'Blocked agent work is waiting on an operator decision.',
        source: 'heuristic'
      }
    }
    return {
      nextStep: 'Review the completed work, then mark Done if no follow-up is needed.',
      rationale: 'Recent agent completions stay visible until you close the loop.',
      source: 'heuristic'
    }
  }

  if (input.tab === 'instantly') {
    const status = (input.instantlyStatus || '').toLowerCase()
    if (status === 'meeting_booked') {
      return {
        nextStep: 'Confirm the meeting and prep a short agenda before the call.',
        rationale: 'Meeting booked is the highest Instantly intent signal.',
        source: 'heuristic'
      }
    }
    if (status === 'interested') {
      return {
        nextStep: 'Reply within a few hours with a concrete next step or booking link.',
        rationale: 'Positive Instantly interest cools quickly without a human reply.',
        source: 'heuristic'
      }
    }
    return {
      nextStep: 'Read the reply and either book a call or mark Done if it’s a soft no.',
      rationale: 'Instantly replies need a human triage pass.',
      source: 'heuristic'
    }
  }

  const lifecycle = input.lifecycle ?? 'new'
  if (lifecycle === 'new') {
    return {
      nextStep: 'Qualify the lead — reply or call, then mark Contacted.',
      rationale: `${input.sourceLabel || 'Inbound'} leads start as new until someone owns the first touch.`,
      source: 'heuristic'
    }
  }
  if (lifecycle === 'contacted') {
    return {
      nextStep: 'Push to Qualified once intent is clear, or Discard if it’s noise.',
      rationale: 'Already contacted — next decision is fit, not first touch.',
      source: 'heuristic'
    }
  }
  if (lifecycle === 'qualified') {
    return {
      nextStep: 'Create a follow-up task or hand off into pipeline, then mark Done.',
      rationale: 'Qualified inbound should leave Inbox as tracked work.',
      source: 'heuristic'
    }
  }
  return {
    nextStep: 'No action needed — this lead is discarded.',
    rationale: 'Discarded leads stay out of the actionable queue.',
    source: 'heuristic'
  }
}

export function projectInboundLeadLifecycle(row: Record<string, unknown>): LeadLifecycleStatus {
  return parseLeadLifecycle(row.lifecycle_status) ?? 'new'
}

export type RelatedInboxHit = {
  tab: InboxChannel
  itemId: string
  title: string
}
