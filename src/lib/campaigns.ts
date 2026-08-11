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

export const EXPERIMENT_FACTORS = [
  'none',
  'cta',
  'expression',
  'structure',
  'offer',
  'audience'
] as const
export type ExperimentFactor = (typeof EXPERIMENT_FACTORS)[number]

export const EXPERIMENT_ROLES = ['none', 'control', 'challenger', 'solo'] as const
export type ExperimentRole = (typeof EXPERIMENT_ROLES)[number]

export const EXPERIMENT_STATUSES = [
  'none',
  'queued',
  'running',
  'ready_to_call',
  'won',
  'lost',
  'killed',
  'inconclusive'
] as const
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number]

export const CTA_TYPES = [
  'permission',
  'timed_call',
  'interest_check',
  'give_first',
  'other'
] as const
export type CtaType = (typeof CTA_TYPES)[number]

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
  hypothesis?: string | null
  experiment_factor?: ExperimentFactor | string
  experiment_role?: ExperimentRole | string
  parent_campaign_id?: string | null
  experiment_status?: ExperimentStatus | string
  sample_size_target?: number | null
  experiment_decision?: string | null
  expression_key?: string | null
  cta_type?: CtaType | string | null
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
  'id,name,status,priority,health,start_date,end_date,color,summary,labels,owner_label,instantly_campaign_id,offer_key,structure_id,opener_mode,vertical_tags,location_tags,cold_expression,sequence_draft,copy_status,hypothesis,experiment_factor,experiment_role,parent_campaign_id,experiment_status,sample_size_target,experiment_decision,expression_key,cta_type,created_at,updated_at'

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
    copy_status: 'none' as OutboundCopyStatus,
    hypothesis: null as string | null,
    experiment_factor: 'none' as ExperimentFactor,
    experiment_role: 'none' as ExperimentRole,
    parent_campaign_id: null as string | null,
    experiment_status: 'none' as ExperimentStatus,
    sample_size_target: null as number | null,
    experiment_decision: null as string | null,
    expression_key: null as string | null,
    cta_type: null as string | null
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
    copy_status: normalizeCopyStatus(row.copy_status ?? 'none'),
    hypothesis: row.hypothesis ?? null,
    experiment_factor: normalizeExperimentFactor(row.experiment_factor),
    experiment_role: normalizeExperimentRole(row.experiment_role),
    parent_campaign_id: row.parent_campaign_id ?? null,
    experiment_status: normalizeExperimentStatus(row.experiment_status),
    sample_size_target:
      typeof row.sample_size_target === 'number' && Number.isFinite(row.sample_size_target)
        ? Math.max(0, Math.floor(row.sample_size_target))
        : null,
    experiment_decision: row.experiment_decision ?? null,
    expression_key: row.expression_key ?? null,
    cta_type: normalizeCtaType(row.cta_type)
  }
}

export function normalizeExperimentFactor(value: string | undefined | null): ExperimentFactor {
  if (value && (EXPERIMENT_FACTORS as readonly string[]).includes(value)) {
    return value as ExperimentFactor
  }
  return 'none'
}

export function normalizeExperimentRole(value: string | undefined | null): ExperimentRole {
  if (value && (EXPERIMENT_ROLES as readonly string[]).includes(value)) {
    return value as ExperimentRole
  }
  return 'none'
}

export function normalizeExperimentStatus(value: string | undefined | null): ExperimentStatus {
  if (value && (EXPERIMENT_STATUSES as readonly string[]).includes(value)) {
    return value as ExperimentStatus
  }
  return 'none'
}

export function normalizeCtaType(value: string | undefined | null): CtaType | null {
  if (!value) return null
  if ((CTA_TYPES as readonly string[]).includes(value)) return value as CtaType
  return null
}

/** Validate challenger invariants before write. Returns error code or null. */
export function validateExperimentWrite(input: {
  experiment_role?: string | null
  experiment_factor?: string | null
  experiment_status?: string | null
  parent_campaign_id?: string | null
  hypothesis?: string | null
}): string | null {
  const role = normalizeExperimentRole(input.experiment_role)
  const factor = normalizeExperimentFactor(input.experiment_factor)
  const status = normalizeExperimentStatus(input.experiment_status)
  const parent = (input.parent_campaign_id || '').trim() || null
  const hypothesis = (input.hypothesis || '').trim() || null

  if (role === 'challenger') {
    if (!parent) return 'challenger_needs_parent'
    if (factor === 'none') return 'challenger_needs_factor'
  }
  if (status !== 'none' && !hypothesis) return 'hypothesis_required'
  return null
}

export function experimentStatusLabel(status: string): string {
  switch (status) {
    case 'none':
      return 'None'
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'ready_to_call':
      return 'Ready to call'
    case 'won':
      return 'Won'
    case 'lost':
      return 'Lost'
    case 'killed':
      return 'Killed'
    case 'inconclusive':
      return 'Inconclusive'
    default:
      return status.replaceAll('_', ' ')
  }
}

export function experimentFactorLabel(factor: string): string {
  if (factor === 'none') return 'None'
  if (factor === 'cta') return 'CTA'
  return factor.charAt(0).toUpperCase() + factor.slice(1)
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
