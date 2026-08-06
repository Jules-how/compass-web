import {
  inboundSourceLabel,
  type PortalInboundLead
} from '@/lib/inbound-leads-ui'
import type { CompassTask, LeadContact } from '@/lib/types'

export const INBOX_TABS = ['agents', 'gmails', 'instantly', 'leads'] as const

export type InboxTab = (typeof INBOX_TABS)[number]

export type InboxTabCounts = Record<InboxTab, number>

export type InboxItem = {
  id: string
  tab: InboxTab
  title: string
  preview: string
  occurredAt: string
  unread: boolean
  sourceLabel: string | null
  contactName: string | null
  email: string | null
  phone: string | null
  body: string | null
  href: string | null
  meta: { label: string; value: string }[]
}

export type InboxPayload = {
  tab: InboxTab
  items: InboxItem[]
  total: number
  counts: InboxTabCounts
  /** Backward-compatible total used by nav badge + Home. */
  badgeTotal: number
  /** Legacy shape for older consumers. */
  leads: PortalInboundLead[]
}

export const INBOX_TAB_LABELS: Record<InboxTab, string> = {
  agents: 'Agents',
  gmails: 'Gmail',
  instantly: 'Instantly',
  leads: 'Leads'
}

export const INBOX_TAB_HINTS: Record<InboxTab, string> = {
  agents: 'Agents completing work that need you',
  gmails: 'Inbound Gmail that needs a reply or review',
  instantly: 'Instantly replies and positive interest',
  leads: 'Client website, guide, and Meta inbound leads'
}

export function parseInboxTab(value: string | null | undefined): InboxTab {
  if (value === 'website') return 'leads'
  if (value && (INBOX_TABS as readonly string[]).includes(value)) {
    return value as InboxTab
  }
  return 'leads'
}

export function emptyInboxCounts(): InboxTabCounts {
  return { agents: 0, gmails: 0, instantly: 0, leads: 0 }
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
  const diffMs = now - date.getTime()
  const abs = Math.abs(diffMs)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (abs < minute) return 'now'
  if (abs < hour) {
    const n = Math.round(abs / minute)
    return `${n}m`
  }
  if (abs < day) {
    const n = Math.round(abs / hour)
    return `${n}h`
  }
  if (abs < 7 * day) {
    const n = Math.round(abs / day)
    return `${n}d`
  }
  return formatInboxWhen(iso)
}

function clip(text: string | null | undefined, max = 120): string {
  const value = (text ?? '').trim()
  if (!value) return ''
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

/** Tasks that need operator attention after agent / async work. */
export function isAgentAttentionTask(task: Pick<CompassTask, 'status' | 'parent_task_id'>): boolean {
  if (task.parent_task_id) return false
  return task.status === 'blocked' || task.status === 'completed'
}

export function projectAgentInboxItem(task: CompassTask): InboxItem {
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

  return {
    id: `agent:${task.id}`,
    tab: 'agents',
    title: task.title,
    preview,
    occurredAt: task.updated_at || task.created_at,
    unread: task.status === 'blocked',
    sourceLabel: 'Agent',
    contactName: null,
    email: null,
    phone: null,
    body: task.notes?.trim() || statusLabel,
    href: '/tasks',
    meta
  }
}

export function projectInstantlyInboxItem(lead: LeadContact): InboxItem {
  const interest = lead.interest_label?.trim() || null
  const campaign =
    lead.instantly_campaign_name?.trim() ||
    lead.instantly_campaign?.trim() ||
    null
  const preview =
    clip(interest) ||
    clip(campaign ? `Replied on ${campaign}` : null) ||
    'Instantly reply'
  const meta: InboxItem['meta'] = [
    { label: 'Outbound status', value: lead.outbound_status || 'replied' }
  ]
  if (interest) meta.push({ label: 'Interest', value: interest })
  if (campaign) meta.push({ label: 'Campaign', value: campaign })
  if (lead.company) meta.push({ label: 'Company', value: lead.company })
  if (lead.role) meta.push({ label: 'Role', value: lead.role })

  return {
    id: `instantly:${lead.id}`,
    tab: 'instantly',
    title: lead.name?.trim() || lead.email || 'Instantly reply',
    preview,
    occurredAt: lead.updated_at || lead.last_outbound_at || lead.mirrored_at,
    unread: true,
    sourceLabel: 'Instantly',
    contactName: lead.name,
    email: lead.email,
    phone: lead.phone,
    body:
      interest ||
      (campaign ? `Reply associated with campaign “${campaign}”.` : 'Instantly inbound reply.'),
    href: `/leads?outbound_status=replied`,
    meta
  }
}

export function projectWebsiteInboxItem(lead: PortalInboundLead): InboxItem {
  const source = inboundSourceLabel(lead.source)
  return {
    id: `leads:${lead.id}`,
    tab: 'leads',
    title: lead.name,
    preview: clip(lead.summary) || source,
    occurredAt: lead.submittedAt,
    unread: true,
    sourceLabel: source,
    contactName: lead.name,
    email: lead.email,
    phone: lead.phone,
    body: lead.summary,
    href: null,
    meta: [
      { label: 'Source', value: source },
      { label: 'Channel', value: lead.channel },
      { label: 'Submitted', value: formatInboxWhen(lead.submittedAt) }
    ]
  }
}

export function isInstantlyInboundLead(lead: Pick<LeadContact, 'outbound_status'>): boolean {
  const status = (lead.outbound_status || '').toLowerCase()
  return status === 'replied' || status === 'interested' || status === 'meeting_booked'
}
