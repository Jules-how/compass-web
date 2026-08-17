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
  go_live_at: string | null
  google_calendar_event_id?: string | null
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
  wave_cap?: number | null
  opener_reviewed_at?: string | null
  copy_confirmed_at?: string | null
  /** Computed on list/detail — not a DB column. */
  wave_cohort_count?: number
  wave_positive_count?: number
  wave_meeting_count?: number
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

const CAMPAIGN_CORE_COLUMNS =
  'id,name,status,priority,health,start_date,end_date,go_live_at,google_calendar_event_id,color,summary,labels,owner_label,instantly_campaign_id,offer_key,structure_id,opener_mode,vertical_tags,location_tags,copy_status,hypothesis,experiment_factor,experiment_role,parent_campaign_id,experiment_status,sample_size_target,experiment_decision,expression_key,cta_type,wave_cap,opener_reviewed_at,copy_confirmed_at,created_at,updated_at'

/** Planner / list GET — skip bulky sequence JSON. */
export const CAMPAIGN_BOARD_COLUMNS = CAMPAIGN_CORE_COLUMNS

/** Single-campaign GET and Instantly bind — includes copy bodies. */
export const CAMPAIGN_LIST_COLUMNS = `${CAMPAIGN_CORE_COLUMNS},cold_expression,sequence_draft`

export const GO_LIVE_TIMEZONE = 'Australia/Sydney'
export const MAX_LEAD_OPENER = 400

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
    cta_type: null as string | null,
    wave_cap: null as number | null,
    opener_reviewed_at: null as string | null,
    copy_confirmed_at: null as string | null
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
    cta_type: normalizeCtaType(row.cta_type),
    wave_cap:
      typeof row.wave_cap === 'number' && Number.isFinite(row.wave_cap)
        ? Math.max(0, Math.floor(row.wave_cap))
        : null,
    opener_reviewed_at: row.opener_reviewed_at ?? null,
    copy_confirmed_at: row.copy_confirmed_at ?? null,
    go_live_at: row.go_live_at ?? null,
    google_calendar_event_id: row.google_calendar_event_id ?? null,
    wave_cohort_count:
      typeof row.wave_cohort_count === 'number' ? row.wave_cohort_count : undefined,
    wave_positive_count:
      typeof row.wave_positive_count === 'number' ? row.wave_positive_count : undefined,
    wave_meeting_count:
      typeof row.wave_meeting_count === 'number' ? row.wave_meeting_count : undefined
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

export function parseGoLiveAt(value: unknown): { ok: true; iso: string | null } | { ok: false } {
  if (value === undefined) return { ok: false }
  if (value == null || value === '') return { ok: true, iso: null }
  if (typeof value !== 'string') return { ok: false }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { ok: false }
  return { ok: true, iso: date.toISOString() }
}

export function dateOnlyInZone(
  iso: string,
  timeZone: string = GO_LIVE_TIMEZONE
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(iso))
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}

export function localDateOnlyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatGoLiveAt(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function formatGoLiveTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
}

export function openerModeLabel(mode?: string | null): string | null {
  const value = (mode || '').trim().toLowerCase()
  if (!value || value === 'nick-tier') return null
  if (value === 'none' || value === 'as-written' || value === 'written') return 'open as written'
  return value.replaceAll('_', ' ')
}

export function campaignLeadCountLabel(campaign: Pick<CompassCampaign, 'wave_cohort_count' | 'wave_cap'>): string | null {
  const count =
    typeof campaign.wave_cohort_count === 'number' && Number.isFinite(campaign.wave_cohort_count)
      ? Math.max(0, Math.floor(campaign.wave_cohort_count))
      : 0
  if (count <= 0) return null
  const cap =
    typeof campaign.wave_cap === 'number' && Number.isFinite(campaign.wave_cap)
      ? Math.max(0, Math.floor(campaign.wave_cap))
      : null
  if (cap != null && cap > 0) return `${count} / ${cap} leads`
  return `${count} lead${count === 1 ? '' : 's'}`
}

export function goLiveToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 09:00 Australia/Sydney on YYYY-MM-DD as UTC ISO. */
export function sydneyNineAmIso(dateOnly: string): string {
  const plus10 = new Date(`${dateOnly}T09:00:00+10:00`)
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: GO_LIVE_TIMEZONE,
      hour: 'numeric',
      hourCycle: 'h23'
    }).format(plus10)
  )
  const offset = hour === 9 ? '+10:00' : hour === 8 ? '+11:00' : '+10:00'
  return new Date(`${dateOnly}T09:00:00${offset}`).toISOString()
}

/** Next weekday 09:00 Australia/Sydney (today if already a weekday). */
export function defaultGoLiveAt(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: GO_LIVE_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short'
    })
      .formatToParts(now)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  ) as Record<string, string>
  let year = Number(parts.year)
  let month = Number(parts.month)
  let day = Number(parts.day)
  const weekday = parts.weekday
  const shift = weekday === 'Sat' ? 2 : weekday === 'Sun' ? 1 : 0
  if (shift) {
    const utc = Date.UTC(year, month - 1, day + shift)
    const next = new Date(utc)
    year = next.getUTCFullYear()
    month = next.getUTCMonth() + 1
    day = next.getUTCDate()
  }
  return sydneyNineAmIso(`${year}-${pad2(month)}-${pad2(day)}`)
}

export function shiftGoLiveAt(iso: string, deltaDays: number): string {
  const date = new Date(iso)
  date.setDate(date.getDate() + deltaDays)
  return date.toISOString()
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
