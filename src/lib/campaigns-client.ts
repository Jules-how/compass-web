'use client'

import {
  emptyCampaignCopyFields,
  type CompassCampaign,
  type CompassCampaignActivity,
  type CompassCampaignMilestone
} from '@/lib/campaigns'
import type { OutboundSequence } from '@/lib/outbound-copy'
import type { WaveSnapshot } from '@/lib/campaign-wave'
import { peekQueryCache, writeQueryCache } from '@/lib/query-cache'

export const CAMPAIGNS_QUERY_KEY = '/api/campaigns'

const LOCAL_STORAGE_KEY = 'compass.pipeline.campaigns.v1'
const MIGRATED_FLAG = 'compass.pipeline.campaigns.migrated.v1'

export type CampaignPatch = Partial<{
  name: string
  status: string
  priority: number
  health: string
  start_date: string | null
  end_date: string | null
  go_live_at: string | null
  color: string
  summary: string | null
  labels: string[]
  owner_label: string | null
  instantly_campaign_id: string | null
  offer_key: string | null
  structure_id: string | null
  opener_mode: string | null
  vertical_tags: string[]
  location_tags: string[]
  cold_expression: string | null
  sequence_draft: OutboundSequence | null
  copy_status: string
  hypothesis: string | null
  experiment_factor: string
  experiment_role: string
  parent_campaign_id: string | null
  experiment_status: string
  sample_size_target: number | null
  experiment_decision: string | null
  expression_key: string | null
  cta_type: string | null
  opener_reviewed_at: string | null
  copy_confirmed_at: string | null
  wave_lane: string | null
  wave_rationale: string | null
  wave_list_size: number | null
  wave_copy_strategy: string | null
  wave_approach: string | null
  testing_variable: string | null
}>

export type CampaignDetail = {
  campaign: CompassCampaign
  milestones: CompassCampaignMilestone[]
  activity: CompassCampaignActivity[]
  wave?: WaveSnapshot | null
}

function project(row: CompassCampaign): CompassCampaign {
  return {
    ...emptyCampaignCopyFields(),
    ...row,
    labels: Array.isArray(row.labels) ? row.labels : [],
    priority: typeof row.priority === 'number' ? row.priority : 0,
    health: row.health || 'no_updates',
    color: row.color || '#94a3b8'
  }
}

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string }
  if (!res.ok) {
    const message =
      (typeof body.detail === 'string' && body.detail) ||
      (typeof body.error === 'string' && body.error) ||
      `Request failed (${res.status})`
    throw new Error(message)
  }
  return body
}

function sortCampaigns(rows: CompassCampaign[]): CompassCampaign[] {
  return rows.slice().sort((a, b) => {
    const as = a.go_live_at || a.start_date || '9999'
    const bs = b.go_live_at || b.start_date || '9999'
    return as.localeCompare(bs) || a.name.localeCompare(b.name)
  })
}

function bumpCampaignsCache(campaigns: CompassCampaign[]) {
  writeQueryCache(CAMPAIGNS_QUERY_KEY, { campaigns: sortCampaigns(campaigns) })
}

function upsertInCache(campaign: CompassCampaign) {
  const projected = project(campaign)
  const snap = peekQueryCache<{ campaigns: CompassCampaign[] }>(CAMPAIGNS_QUERY_KEY)
  const list = snap?.data?.campaigns ?? []
  const idx = list.findIndex((row) => row.id === projected.id)
  const next =
    idx >= 0 ? list.map((row, i) => (i === idx ? projected : row)) : [...list, projected]
  bumpCampaignsCache(next)
}

function removeFromCache(id: string) {
  const snap = peekQueryCache<{ campaigns: CompassCampaign[] }>(CAMPAIGNS_QUERY_KEY)
  const list = snap?.data?.campaigns ?? []
  bumpCampaignsCache(list.filter((row) => row.id !== id))
}

export async function listCampaigns(options?: { force?: boolean }): Promise<CompassCampaign[]> {
  const res = await fetch('/api/campaigns', {
    headers: { Accept: 'application/json' },
    cache: options?.force ? 'no-store' : 'default'
  })
  const body = await readJson<{ campaigns: CompassCampaign[] }>(res)
  const campaigns = sortCampaigns((body.campaigns ?? []).map(project))
  bumpCampaignsCache(campaigns)
  return campaigns
}

export async function getCampaignDetail(id: string): Promise<CampaignDetail | null> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  })
  if (res.status === 404) return null
  const body = await readJson<CampaignDetail>(res)
  return {
    campaign: project(body.campaign),
    milestones: body.milestones ?? [],
    activity: body.activity ?? [],
    wave: body.wave ?? null
  }
}

export async function createCampaign(
  input?: {
    id?: string
    name?: string
    status?: string
    start_date?: string
    end_date?: string
    go_live_at?: string | null
    color?: string
  } & CampaignPatch
): Promise<CompassCampaign> {
  const res = await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      id: input?.id,
      name: input?.name?.trim() || 'New campaign',
      status: input?.status,
      start_date: input?.start_date,
      end_date: input?.end_date,
      go_live_at: input?.go_live_at,
      color: input?.color,
      priority: input?.priority,
      health: input?.health,
      summary: input?.summary,
      labels: input?.labels,
      owner_label: input?.owner_label,
      instantly_campaign_id: input?.instantly_campaign_id,
      offer_key: input?.offer_key,
      structure_id: input?.structure_id,
      opener_mode: input?.opener_mode,
      vertical_tags: input?.vertical_tags,
      location_tags: input?.location_tags,
      cold_expression: input?.cold_expression,
      sequence_draft: input?.sequence_draft,
      copy_status: input?.copy_status,
      hypothesis: input?.hypothesis,
      wave_lane: input?.wave_lane,
      wave_rationale: input?.wave_rationale,
      wave_list_size: input?.wave_list_size,
      wave_copy_strategy: input?.wave_copy_strategy,
      wave_approach: input?.wave_approach,
      testing_variable: input?.testing_variable
    })
  })
  const body = await readJson<{ campaign: CompassCampaign }>(res)
  const campaign = project(body.campaign)
  upsertInCache(campaign)
  return campaign
}

export async function updateCampaign(id: string, patch: CampaignPatch): Promise<CompassCampaign> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch)
  })
  const body = await readJson<{ campaign: CompassCampaign }>(res)
  const campaign = project(body.campaign)
  upsertInCache(campaign)
  return campaign
}

export type InstantlyPushLeadsClientResult = {
  ok: boolean
  dryRun: boolean
  instantlyCampaignId: string
  eligible: Array<{ id: string; email: string }>
  skipped: Array<{ id: string; email: string | null; reason: string }>
  missingVars: Array<{ id: string; email: string; keys: string[] }>
  uploaded: number
  created: Array<{ id: string; email: string; instantlyLeadId: string }>
  instantlySkipped: number
  invalidEmails: number
  marked: number
}

export async function ensureInstantlyCampaign(
  id: string,
  options?: { pushSequence?: boolean }
): Promise<{ created: boolean; instantlyCampaignId: string; campaign: CompassCampaign }> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}/instantly/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ pushSequence: options?.pushSequence === true })
  })
  const body = await readJson<{
    created: boolean
    instantlyCampaignId: string
    campaign: CompassCampaign
  }>(res)
  upsertInCache(project(body.campaign))
  return {
    created: body.created,
    instantlyCampaignId: body.instantlyCampaignId,
    campaign: project(body.campaign)
  }
}

export async function pushInstantlySequence(
  id: string
): Promise<{ instantlyCampaignId: string; steps: number }> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}/instantly/push-sequence`, {
    method: 'POST',
    headers: { Accept: 'application/json' }
  })
  return readJson(res)
}

export async function pushInstantlyLeads(
  id: string,
  options?: {
    leadIds?: string[]
    dryRun?: boolean
    skipIfInWorkspace?: boolean
    verifyOnImport?: boolean
    requireOpener?: boolean
  }
): Promise<InstantlyPushLeadsClientResult> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}/instantly/push-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(options ?? {})
  })
  return readJson(res)
}

export async function duplicateInstantlyTemplate(input: {
  campaignId: string
  name?: string
  templateId?: string
}): Promise<{
  ok: boolean
  instantlyCampaignId: string
  templateId: string
  name: string
  bound: boolean
  campaign: CompassCampaign | null
}> {
  const res = await fetch(
    `/api/campaigns/${encodeURIComponent(input.campaignId)}/instantly/duplicate-template`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name: input.name, templateId: input.templateId })
    }
  )
  const body = await readJson<{
    ok: boolean
    instantlyCampaignId: string
    templateId: string
    name: string
    bound: boolean
    campaign: CompassCampaign | null
  }>(res)
  if (body.campaign) upsertInCache(project(body.campaign))
  return body
}

export type SpawnChallengerInput = {
  name?: string
  factor: string
  hypothesis?: string | null
  sample_size_target?: number | null
  cta_type?: string | null
  cold_expression?: string | null
  expression_key?: string | null
  structure_id?: string | null
  offer_key?: string | null
  vertical_tags?: string[]
  location_tags?: string[]
  sequence_draft?: OutboundSequence | null
  subject?: string | null
  opener_mode?: string | null
}

export async function spawnChallenger(
  parentId: string,
  input: SpawnChallengerInput
): Promise<CompassCampaign> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(parentId)}/challenger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input)
  })
  const campaign = project(await readJson<CompassCampaign>(res))
  upsertInCache(campaign)
  return campaign
}

export async function deleteCampaign(id: string): Promise<void> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' }
  })
  await readJson<{ ok: boolean }>(res)
  removeFromCache(id)
}

export async function replaceCampaignMilestones(
  campaignId: string,
  milestones: Array<{
    id?: string
    title: string
    description?: string | null
    target_date?: string | null
    completed?: boolean
  }>
): Promise<CompassCampaignMilestone[]> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/milestones`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ milestones })
  })
  const body = await readJson<{ milestones: CompassCampaignMilestone[] }>(res)
  return body.milestones ?? []
}

type LocalStoreShape = {
  campaigns?: CompassCampaign[]
  milestones?: Record<string, CompassCampaignMilestone[]>
}

function readLocalStore(): LocalStoreShape | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LocalStoreShape
  } catch {
    return null
  }
}

/** One-shot: push browser-local campaigns into Supabase, then clear localStorage. */
export async function migrateLocalCampaignsOnce(): Promise<number> {
  if (typeof window === 'undefined') return 0
  if (window.localStorage.getItem(MIGRATED_FLAG) === '1') return 0
  const local = readLocalStore()
  const rows = Array.isArray(local?.campaigns) ? local!.campaigns! : []
  if (rows.length === 0) {
    window.localStorage.setItem(MIGRATED_FLAG, '1')
    return 0
  }

  const existing = await listCampaigns({ force: true })
  const existingIds = new Set(existing.map((row) => row.id))
  let migrated = 0
  let failed = 0

  for (const row of rows) {
    if (!row?.id || existingIds.has(row.id)) continue
    try {
      await createCampaign({
        id: row.id,
        name: row.name,
        status: row.status,
        priority: row.priority,
        health: row.health,
        start_date: row.start_date ?? undefined,
        end_date: row.end_date ?? undefined,
        color: row.color,
        summary: row.summary,
        labels: row.labels,
        owner_label: row.owner_label,
        instantly_campaign_id: row.instantly_campaign_id,
        offer_key: row.offer_key,
        structure_id: row.structure_id,
        opener_mode: row.opener_mode,
        vertical_tags: row.vertical_tags,
        location_tags: row.location_tags,
        cold_expression: row.cold_expression,
        sequence_draft: row.sequence_draft,
        copy_status: row.copy_status
      })
      const milestones = local?.milestones?.[row.id] ?? []
      if (milestones.length > 0) {
        await replaceCampaignMilestones(row.id, milestones)
      }
      migrated += 1
    } catch {
      failed += 1
    }
  }

  if (failed === 0) {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY)
    window.localStorage.setItem(MIGRATED_FLAG, '1')
  } else if (migrated > 0) {
    await listCampaigns({ force: true })
  }

  return migrated
}
