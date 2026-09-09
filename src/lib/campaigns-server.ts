import { loadCohortLeadRowsForCampaigns } from './lead-lists'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  CAMPAIGN_ACTIVITY_COLUMNS,
  CAMPAIGN_BOARD_COLUMNS,
  CAMPAIGN_LIST_COLUMNS,
  emptyCampaignCopyFields,
  normalizeCampaignHealth,
  normalizeCampaignStatus,
  normalizeCtaType,
  normalizeLabels,
  normalizeOutboundTagList,
  normalizeTestingVariable,
  normalizeWaveLane,
  projectCampaignCopy,
  type CompassCampaign,
  type CompassCampaignActivity,
  type TestingVariable,
  type WaveLane
} from '@/lib/campaigns'
import { applyLeadTallies, tallyLeadsByCampaign } from '@/lib/campaign-wave'
import { normalizeCopyStatus } from '@/lib/outbound-copy'

export function projectCampaignRow(row: CompassCampaign): CompassCampaign {
  return projectCampaignCopy({
    ...emptyCampaignCopyFields(),
    ...row,
    labels: Array.isArray(row.labels) ? row.labels : [],
    priority: typeof row.priority === 'number' ? row.priority : 0,
    health: row.health || 'no_updates',
    color: row.color || '#94a3b8'
  })
}

export async function listPipelineCampaigns(supabase: SupabaseClient): Promise<CompassCampaign[]> {
  const campaignsRes = await supabase.from('compass_pipeline_campaigns').select(CAMPAIGN_BOARD_COLUMNS).order('go_live_at', { ascending: true, nullsFirst: false })
  if (campaignsRes.error) throw new Error(campaignsRes.error.message)
  const rows = (campaignsRes.data ?? []).map(row => projectCampaignRow(row as unknown as CompassCampaign))
  const cohorts = await loadCohortLeadRowsForCampaigns<{ id: string; outbound_status?: string; opener?: string }>(supabase, rows.map(row => row.id), 'id,pipeline_campaign_id,outbound_status,opener')
  const leads = Object.entries(cohorts).flatMap(([id, leads]) => leads.map(lead => ({ ...lead, pipeline_campaign_id: id })))
  const campaigns = applyLeadTallies(rows, tallyLeadsByCampaign(leads))
  return campaigns
}

export async function getPipelineCampaignRow(
  supabase: SupabaseClient,
  id: string
): Promise<CompassCampaign | null> {
  const { data, error } = await supabase
    .from('compass_pipeline_campaigns')
    .select(CAMPAIGN_LIST_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return projectCampaignRow(data as unknown as CompassCampaign)
}

export type CampaignWriteInput = {
  id?: string
  name: string
  status?: string
  priority?: number
  health?: string
  start_date?: string | null
  end_date?: string | null
  go_live_at?: string | null
  color?: string
  summary?: string | null
  labels?: string[]
  owner_label?: string | null
  instantly_campaign_id?: string | null
  offer_key?: string | null
  structure_id?: string | null
  opener_mode?: string | null
  vertical_tags?: string[]
  location_tags?: string[]
  cold_expression?: string | null
  sequence_draft?: CompassCampaign['sequence_draft']
  copy_status?: string
  hypothesis?: string | null
  wave_lane?: string | null
  wave_rationale?: string | null
  wave_list_size?: number | null
  wave_copy_strategy?: string | null
  wave_approach?: string | null
  testing_variable?: string | null
  sample_size_target?: number | null
  expression_key?: string | null
  cta_type?: string | null
}

function nowIso(): string {
  return new Date().toISOString()
}

export function buildCampaignInsert(input: CampaignWriteInput): Record<string, unknown> {
  const stamp = nowIso()
  const copy = emptyCampaignCopyFields()
  const listSize =
    typeof input.wave_list_size === 'number' && Number.isFinite(input.wave_list_size)
      ? Math.max(0, Math.floor(input.wave_list_size))
      : null
  return {
    id: input.id || `campaign-${crypto.randomUUID()}`,
    name: input.name.trim(),
    status: normalizeCampaignStatus(input.status),
    priority: typeof input.priority === 'number' ? input.priority : 0,
    health: normalizeCampaignHealth(input.health),
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    go_live_at: input.go_live_at ?? null,
    color: input.color || '#94a3b8',
    summary: input.summary ?? null,
    labels: normalizeLabels(input.labels),
    owner_label: input.owner_label ?? null,
    ...copy,
    instantly_campaign_id: input.instantly_campaign_id?.trim() || null,
    offer_key: input.offer_key?.trim() || null,
    structure_id: input.structure_id?.trim() || null,
    opener_mode: input.opener_mode?.trim() || copy.opener_mode,
    vertical_tags: normalizeOutboundTagList(input.vertical_tags),
    location_tags: normalizeOutboundTagList(input.location_tags),
    copy_status: normalizeCopyStatus(input.copy_status),
    cold_expression: input.cold_expression ?? null,
    sequence_draft: input.sequence_draft ?? null,
    hypothesis: input.hypothesis ?? null,
    wave_lane: normalizeWaveLane(input.wave_lane),
    wave_rationale: input.wave_rationale?.trim() || null,
    wave_list_size: listSize,
    wave_copy_strategy: input.wave_copy_strategy?.trim() || null,
    wave_approach: input.wave_approach?.trim() || null,
    testing_variable: normalizeTestingVariable(input.testing_variable),
    sample_size_target:
      typeof input.sample_size_target === 'number' && Number.isFinite(input.sample_size_target)
        ? Math.max(1, Math.floor(input.sample_size_target))
        : null,
    expression_key: input.expression_key?.trim() || null,
    cta_type: normalizeCtaType(input.cta_type),
    created_at: stamp,
    updated_at: stamp
  }
}

const PATCH_KEYS = [
  'name',
  'status',
  'priority',
  'health',
  'start_date',
  'end_date',
  'go_live_at',
  'color',
  'summary',
  'labels',
  'owner_label',
  'instantly_campaign_id',
  'offer_key',
  'structure_id',
  'opener_mode',
  'vertical_tags',
  'location_tags',
  'cold_expression',
  'sequence_draft',
  'copy_status',
  'hypothesis',
  'experiment_factor',
  'experiment_role',
  'parent_campaign_id',
  'experiment_status',
  'sample_size_target',
  'experiment_decision',
  'expression_key',
  'cta_type',
  'opener_reviewed_at',
  'copy_confirmed_at',
  'wave_lane',
  'wave_rationale',
  'wave_list_size',
  'wave_copy_strategy',
  'wave_approach',
  'testing_variable'
] as const

export function buildCampaignPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = { updated_at: nowIso() }
  for (const key of PATCH_KEYS) {
    if (!(key in body)) continue
    const value = body[key]
    if (key === 'status' && typeof value === 'string') patch.status = normalizeCampaignStatus(value)
    else if (key === 'health' && typeof value === 'string') patch.health = normalizeCampaignHealth(value)
    else if (key === 'labels') patch.labels = normalizeLabels(value)
    else if (key === 'vertical_tags' || key === 'location_tags') {
      patch[key] = normalizeOutboundTagList(value)
    } else if (key === 'copy_status' && typeof value === 'string') {
      patch.copy_status = normalizeCopyStatus(value)
    } else if (key === 'wave_lane') {
      patch.wave_lane = normalizeWaveLane(typeof value === 'string' ? value : null)
    } else if (key === 'testing_variable') {
      patch.testing_variable = normalizeTestingVariable(typeof value === 'string' ? value : null)
    } else if (key === 'wave_list_size') {
      patch.wave_list_size =
        typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null
    } else if (key === 'name' && typeof value === 'string') {
      patch.name = value.trim()
    } else {
      patch[key] = value
    }
  }
  return patch
}

export async function insertPipelineCampaign(
  supabase: SupabaseClient,
  input: CampaignWriteInput
): Promise<CompassCampaign> {
  const row = buildCampaignInsert(input)
  const { data, error } = await supabase
    .from('compass_pipeline_campaigns')
    .insert(row)
    .select(CAMPAIGN_LIST_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  await supabase.from('compass_pipeline_activity').insert({
    id: `act-${crypto.randomUUID()}`,
    campaign_id: row.id,
    actor: 'operator',
    action: 'campaign_created',
    body: `Campaign "${row.name}" created`
  })
  return projectCampaignRow(data as unknown as CompassCampaign)
}

export async function updatePipelineCampaignRow(
  supabase: SupabaseClient,
  id: string,
  body: Record<string, unknown>
): Promise<CompassCampaign> {
  const patch = buildCampaignPatch(body)
  const { data, error } = await supabase
    .from('compass_pipeline_campaigns')
    .update(patch)
    .eq('id', id)
    .select(CAMPAIGN_LIST_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('not_found')
  return projectCampaignRow(data as unknown as CompassCampaign)
}

export async function listCampaignActivity(
  supabase: SupabaseClient,
  campaignId: string
): Promise<CompassCampaignActivity[]> {
  const { data, error } = await supabase
    .from('compass_pipeline_activity')
    .select(CAMPAIGN_ACTIVITY_COLUMNS)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []) as CompassCampaignActivity[]
}

export type { TestingVariable, WaveLane }
