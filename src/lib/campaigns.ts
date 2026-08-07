import type { OutboundCopyStatus, OutboundSequence } from '@/lib/outbound-copy'
import { normalizeCopyStatus, normalizeTags as normalizeOutboundTags } from '@/lib/outbound-copy'

export const CAMPAIGN_STATUSES = [
  'draft',
  'planned',
  'active',
  'paused',
  'completed',
  'cancelled'
] as const

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const CAMPAIGN_HEALTHS = ['no_updates', 'on_track', 'at_risk', 'off_track'] as const
export type CampaignHealth = (typeof CAMPAIGN_HEALTHS)[number]

export interface CompassCampaign {
  id: string
  name: string
  status: CampaignStatus | string
  priority: number
  health: CampaignHealth | string
  start_date: string | null
  end_date: string | null
  color: string
  summary: string | null
  labels: string[]
  owner_label: string | null
  instantly_campaign_id?: string | null
  offer_key?: string | null
  structure_id?: string | null
  opener_mode?: string | null
  vertical_tags?: string[]
  location_tags?: string[]
  cold_expression?: string | null
  sequence_draft?: OutboundSequence | null
  copy_status?: OutboundCopyStatus | string
  created_at: string
  updated_at: string
}

export interface CompassCampaignMilestone {
  id: string
  campaign_id: string
  title: string
  description: string | null
  target_date: string | null
  sort_order: number
  completed: boolean
  created_at: string
  updated_at: string
}

export interface CompassCampaignActivity {
  id: string
  campaign_id: string
  actor: string
  action: string
  body: string
  created_at: string
}

export const CAMPAIGN_LIST_COLUMNS =
  'id,name,status,priority,health,start_date,end_date,color,summary,labels,owner_label,instantly_campaign_id,offer_key,structure_id,opener_mode,vertical_tags,location_tags,cold_expression,sequence_draft,copy_status,created_at,updated_at'

export function emptyCampaignCopyFields() {
  return {
    instantly_campaign_id: null as string | null,
    offer_key: null as string | null,
    structure_id: null as string | null,
    opener_mode: 'nick-tier' as string | null,
    vertical_tags: [] as string[],
    location_tags: [] as string[],
    cold_expression: null as string | null,
    sequence_draft: null as OutboundSequence | null,
    copy_status: 'none' as OutboundCopyStatus
  }
}

export function projectCampaignCopy(row: CompassCampaign): CompassCampaign {
  return {
    ...row,
    labels: Array.isArray(row.labels) ? row.labels : [],
    vertical_tags: Array.isArray(row.vertical_tags) ? row.vertical_tags : [],
    location_tags: Array.isArray(row.location_tags) ? row.location_tags : [],
    instantly_campaign_id: row.instantly_campaign_id ?? null,
    offer_key: row.offer_key ?? null,
    structure_id: row.structure_id ?? null,
    opener_mode: row.opener_mode ?? 'nick-tier',
    cold_expression: row.cold_expression ?? null,
    sequence_draft: row.sequence_draft ?? null,
    copy_status: normalizeCopyStatus(row.copy_status ?? 'none')
  }
}

export function normalizeOutboundTagList(value: unknown): string[] {
  return normalizeOutboundTags(value)
}

export const CAMPAIGN_MILESTONE_COLUMNS =
  'id,campaign_id,title,description,target_date,sort_order,completed,created_at,updated_at'

export const CAMPAIGN_ACTIVITY_COLUMNS =
  'id,campaign_id,actor,action,body,created_at'

export function normalizeCampaignStatus(value: string | undefined | null): CampaignStatus {
  if (value && (CAMPAIGN_STATUSES as readonly string[]).includes(value)) {
    return value as CampaignStatus
  }
  return 'planned'
}

export function normalizeCampaignHealth(value: string | undefined | null): CampaignHealth {
  if (value && (CAMPAIGN_HEALTHS as readonly string[]).includes(value)) {
    return value as CampaignHealth
  }
  return 'no_updates'
}

export function normalizeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 20)
}

export function campaignStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'planned':
      return 'Planned'
    case 'active':
      return 'Active'
    case 'paused':
      return 'Paused'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

export function campaignPriorityLabel(priority: number): string {
  switch (priority) {
    case 1:
      return 'Urgent'
    case 2:
      return 'High'
    case 3:
      return 'Medium'
    case 4:
      return 'Low'
    default:
      return 'No priority'
  }
}

export function campaignHealthLabel(health: string): string {
  switch (health) {
    case 'on_track':
      return 'On track'
    case 'at_risk':
      return 'At risk'
    case 'off_track':
      return 'Off track'
    case 'no_updates':
      return 'No updates'
    default:
      return health.replaceAll('_', ' ')
  }
}

export function formatCampaignDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const CAMPAIGN_COLORS = [
  '#94a3b8',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ef4444',
  '#14b8a6'
] as const
