import {
  inboundSourceLabel,
  type PortalInboundLead
} from '@/lib/inbound-leads-ui'
import {
  effectiveTriage,
  inboxIdentityKey,
  isAgentAttentionTask,
  isAgentBlockedTask,
  isInstantlyInboundLead,
  isLeadLifecycleActionable,
  isTriageActionable,
  isUnreadTriage,
  scoreInboxItem,
  type InboxChannel,
  type InboxTriageState,
  type LeadLifecycleStatus,
  type RelatedInboxHit,
  type TriageLookup
} from '@/lib/inbox-triage'
import type { CompassTask, LeadContact } from '@/lib/types'

/** Visible Inbox tabs — Gmail stays reserved until sync ships. */
export const INBOX_TABS = ['agents', 'instantly', 'leads'] as const

export type InboxTab = (typeof INBOX_TABS)[number]

export type InboxTabCounts = Record<InboxTab, number>

export type InboxItem = {
  id: string
  tab: InboxTab
  sourceId: string
  title: string
  preview: string
  occurredAt: string
  unread: boolean
  triage: InboxTriageState
  snoozedUntil: string | null
  actionable: boolean
  score: number
  identityKey: string | null
  related: RelatedInboxHit[]
  lifecycle: LeadLifecycleStatus | null
  sourceLabel: string | null
  contactName: string | null
  email: string | null
  phone: string | null
  body: string | null
  href: string | null
  meta: { label: string; value: string }[]
  agentStatus?: string | null
  instantlyStatus?: string | null
}

export type InboxChannels = Record<InboxTab, InboxItem[]>

export type InboxPayload = {
  tab: InboxTab
  items: InboxItem[]
  total: number
  counts: InboxTabCounts
  /** Actionable unread total used by nav badge + Home. */
  badgeTotal: number
  /** Cross-tab priority strip. */
  needsYou: InboxItem[]
  /**
   * Full work-queue by tab. Present so the client can switch tabs without
   * re-fetching — the API already loads every channel for counts/Needs you.
   */
  channels: InboxChannels
  /** Legacy shape for older consumers. */
  leads: PortalInboundLead[]
}

/** Shared client cache key — matches nav hover prefetch + badge warm. */
export const INBOX_CACHE_KEY = '/api/inbox'

export function emptyInboxChannels(): InboxChannels {
  return { agents: [], instantly: [], leads: [] }
}

export function itemsForInboxTab(payload: InboxPayload | null | undefined, tab: InboxTab): InboxItem[] {
  if (!payload) return []
  if (payload.channels?.[tab]) return payload.channels[tab]
  if (payload.tab === tab) return payload.items ?? []
  return (payload.items ?? []).filter((item) => item.tab === tab)
}

export const INBOX_TAB_LABELS: Record<InboxTab, string> = {
  agents: 'Agents',
  instantly: 'Instantly',
  leads: 'Leads'
}

export const INBOX_TAB_HINTS: Record<InboxTab, string> = {
  agents: 'Blocked agent work first — completions stay for review until Done',
  instantly: 'Instantly replies and positive interest, ranked by intent',
  leads: 'Website, guide, and Meta inbound — new through qualified'
}

export function parseInboxTab(value: string | null | undefined): InboxTab {
  if (value === 'website') return 'leads'
  // Gmail tab is hidden until sync — fall back to leads.
  if (value === 'gmails' || value === 'gmail') return 'leads'
  if (value && (INBOX_TABS as readonly string[]).includes(value)) {
    return value as InboxTab
  }
  return 'leads'
}

export function emptyInboxCounts(): InboxTabCounts {
  return { agents: 0, instantly: 0, leads: 0 }
}

export function formatInboxWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function formatInboxRelative(iso: string, now = Date.now()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const abs = Math.abs(now - date.getTime())
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (abs < minute) return 'now'
  if (abs < hour) return `${Math.round(abs / minute)}m`
  if (abs < day) return `${Math.round(abs / hour)}h`
  if (abs < 7 * day) return `${Math.round(abs / day)}d`
  return formatInboxWhen(iso)
}

function clip(text: string | null | undefined, max = 120): string {
  const value = (text ?? '').trim()
  if (!value) return ''
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

function triageFor(
  lookup: TriageLookup | undefined,
  channel: InboxChannel,
  sourceId: string
): { triage: InboxTriageState; snoozedUntil: string | null; identityKey: string | null } {
  const row = lookup?.get(`${channel}:${sourceId}`)
  return {
    triage: effectiveTriage(row?.triage, row?.snoozed_until),
    snoozedUntil: row?.snoozed_until ?? null,
    identityKey: row?.identity_key ?? null
  }
}

export { isAgentAttentionTask, isAgentBlockedTask, isInstantlyInboundLead }

export function projectAgentInboxItem(
  task: CompassTask,
  lookup?: TriageLookup,
  now = Date.now()
): InboxItem {
  const statusLabel =
    task.status === 'blocked'
      ? 'Blocked — needs you'
      : task.status === 'completed'
        ? 'Completed — review & close the loop'
        : task.status
  const preview = clip(task.notes) || statusLabel
  const meta: InboxItem['meta'] = [
    { label: 'Status', value: task.status },
    { label: 'Priority', value: String(task.priority) }
  ]
  if (task.task_type) meta.push({ label: 'Type', value: task.task_type })
  if (task.due) meta.push({ label: 'Due', value: formatInboxWhen(task.due) })

  const { triage, snoozedUntil, identityKey } = triageFor(lookup, 'agents', task.id)
  const occurredAt = task.updated_at || task.created_at
  const unread = isUnreadTriage(triage, snoozedUntil, now)
  const actionable =
    isTriageActionable(triage, snoozedUntil, now) &&
    (task.status === 'blocked' || task.status === 'completed')
  const score = scoreInboxItem(
    {
      tab: 'agents',
      occurredAt,
      agentStatus: task.status,
      unread
    },
    now
  )

  return {
    id: `agent:${task.id}`,
    tab: 'agents',
    sourceId: task.id,
    title: task.title,
    preview,
    occurredAt,
    unread,
    triage,
    snoozedUntil,
    actionable,
    score,
    identityKey,
    related: [],
    lifecycle: null,
    sourceLabel: 'Agent',
    contactName: null,
    email: null,
    phone: null,
    body: task.notes?.trim() || statusLabel,
    href: '/tasks',
    meta,
    agentStatus: task.status,
    instantlyStatus: null
  }
}

export function projectInstantlyInboxItem(
  lead: LeadContact,
  lookup?: TriageLookup,
  now = Date.now()
): InboxItem {
  const interest = lead.interest_label?.trim() || null
  const campaign =
    lead.instantly_campaign_name?.trim() || lead.instantly_campaign?.trim() || null
  const preview =
    clip(interest) || clip(campaign ? `Replied on ${campaign}` : null) || 'Instantly reply'
  const meta: InboxItem['meta'] = [
    { label: 'Outbound status', value: lead.outbound_status || 'replied' }
  ]
  if (interest) meta.push({ label: 'Interest', value: interest })
  if (campaign) meta.push({ label: 'Campaign', value: campaign })
  if (lead.company) meta.push({ label: 'Company', value: lead.company })
  if (lead.role) meta.push({ label: 'Role', value: lead.role })

  const identity = inboxIdentityKey(lead.email, lead.phone)
  const { triage, snoozedUntil, identityKey } = triageFor(lookup, 'instantly', lead.id)
  const occurredAt = lead.updated_at || lead.last_outbound_at || lead.mirrored_at
  const unread = isUnreadTriage(triage, snoozedUntil, now)
  const actionable = isTriageActionable(triage, snoozedUntil, now)
  const score = scoreInboxItem(
    {
      tab: 'instantly',
      occurredAt,
      instantlyStatus: lead.outbound_status,
      unread
    },
    now
  )

  return {
    id: `instantly:${lead.id}`,
    tab: 'instantly',
    sourceId: lead.id,
    title: lead.name?.trim() || lead.email || 'Instantly reply',
    preview,
    occurredAt,
    unread,
    triage,
    snoozedUntil,
    actionable,
    score,
    identityKey: identityKey || identity,
    related: [],
    lifecycle: null,
    sourceLabel: 'Instantly',
    contactName: lead.name,
    email: lead.email,
    phone: lead.phone,
    body:
      interest ||
      (campaign ? `Reply associated with campaign “${campaign}”.` : 'Instantly inbound reply.'),
    href: `/leads?outbound_status=replied`,
    meta,
    agentStatus: null,
    instantlyStatus: lead.outbound_status
  }
}

export function projectWebsiteInboxItem(
  lead: PortalInboundLead,
  lookup?: TriageLookup,
  now = Date.now()
): InboxItem {
  const source = inboundSourceLabel(lead.source)
  const identity = inboxIdentityKey(lead.email, lead.phone)
  const { triage, snoozedUntil, identityKey } = triageFor(lookup, 'leads', lead.id)
  const lifecycle = lead.lifecycleStatus ?? 'new'
  const unread = isUnreadTriage(triage, snoozedUntil, now)
  const actionable =
    isTriageActionable(triage, snoozedUntil, now) && isLeadLifecycleActionable(lifecycle)
  const score = scoreInboxItem(
    {
      tab: 'leads',
      occurredAt: lead.submittedAt,
      leadChannel: lead.channel,
      lifecycle,
      unread
    },
    now
  )

  return {
    id: `leads:${lead.id}`,
    tab: 'leads',
    sourceId: lead.id,
    title: lead.name,
    preview: clip(lead.summary) || source,
    occurredAt: lead.submittedAt,
    unread,
    triage,
    snoozedUntil,
    actionable,
    score,
    identityKey: identityKey || identity,
    related: [],
    lifecycle,
    sourceLabel: source,
    contactName: lead.name,
    email: lead.email,
    phone: lead.phone,
    body: lead.summary,
    href: null,
    meta: [
      { label: 'Source', value: source },
      { label: 'Channel', value: lead.channel },
      { label: 'Lifecycle', value: lifecycle },
      { label: 'Submitted', value: formatInboxWhen(lead.submittedAt) }
    ],
    agentStatus: null,
    instantlyStatus: null
  }
}

export function sortInboxItems(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return Date.parse(b.occurredAt) - Date.parse(a.occurredAt)
  })
}

/** Attach related cross-channel hits that share an identity key. */
export function linkRelatedInboxItems(items: InboxItem[]): InboxItem[] {
  const byIdentity = new Map<string, InboxItem[]>()
  for (const item of items) {
    if (!item.identityKey) continue
    const list = byIdentity.get(item.identityKey) ?? []
    list.push(item)
    byIdentity.set(item.identityKey, list)
  }

  return items.map((item) => {
    if (!item.identityKey) return item
    const peers = byIdentity.get(item.identityKey) ?? []
    const related: RelatedInboxHit[] = peers
      .filter((peer) => peer.id !== item.id)
      .map((peer) => ({
        tab: peer.tab,
        itemId: peer.id,
        title: peer.title
      }))
    return related.length ? { ...item, related } : item
  })
}

/**
 * Needs-you strip: highest-scoring actionable items, one per identity when possible.
 */
export function pickNeedsYou(items: InboxItem[], limit = 8): InboxItem[] {
  const actionable = sortInboxItems(items.filter((item) => item.actionable))
  const preferred = actionable.filter((item) => {
    if (item.tab === 'agents') return item.agentStatus === 'blocked'
    return item.unread
  })
  const pool = preferred.length ? preferred : actionable
  const seenIdentity = new Set<string>()
  const picked: InboxItem[] = []
  for (const item of pool) {
    if (item.identityKey) {
      if (seenIdentity.has(item.identityKey)) continue
      seenIdentity.add(item.identityKey)
    }
    picked.push(item)
    if (picked.length >= limit) break
  }
  return picked
}

/** Badge counts: blocked agents + actionable Instantly + actionable leads. */
export function countActionableBadge(items: {
  agents: InboxItem[]
  instantly: InboxItem[]
  leads: InboxItem[]
}): InboxTabCounts {
  return {
    agents: items.agents.filter(
      (item) => item.actionable && item.agentStatus === 'blocked' && item.unread
    ).length,
    instantly: items.instantly.filter((item) => item.actionable && item.unread).length,
    leads: items.leads.filter((item) => item.actionable && item.unread).length
  }
}
