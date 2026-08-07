import {
  CAMPAIGN_COLORS,
  emptyCampaignCopyFields,
  normalizeCampaignHealth,
  normalizeCampaignStatus,
  normalizeLabels,
  normalizeOutboundTagList,
  type CompassCampaign,
  type CompassCampaignActivity,
  type CompassCampaignMilestone
} from '@/lib/campaigns'
import {
  coldExpressionFromSequence,
  isValidSequence,
  normalizeCopyStatus,
  type OutboundSequence
} from '@/lib/outbound-copy'

const STORAGE_KEY = 'compass.pipeline.campaigns.v1'

type StoreShape = {
  campaigns: CompassCampaign[]
  milestones: Record<string, CompassCampaignMilestone[]>
  activity: Record<string, CompassCampaignActivity[]>
}

function nowIso(): string {
  return new Date().toISOString()
}

function emptyStore(): StoreShape {
  return { campaigns: [], milestones: {}, activity: {} }
}

function readStore(): StoreShape {
  if (typeof window === 'undefined') return emptyStore()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as StoreShape
    return {
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
      milestones: parsed.milestones && typeof parsed.milestones === 'object' ? parsed.milestones : {},
      activity: parsed.activity && typeof parsed.activity === 'object' ? parsed.activity : {}
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: StoreShape) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function pushActivity(
  store: StoreShape,
  campaignId: string,
  action: string,
  body: string,
  actor = 'operator'
) {
  const row: CompassCampaignActivity = {
    id: `cact-${crypto.randomUUID()}`,
    campaign_id: campaignId,
    actor,
    action,
    body,
    created_at: nowIso()
  }
  store.activity[campaignId] = [row, ...(store.activity[campaignId] ?? [])].slice(0, 80)
}

export function listLocalCampaigns(): CompassCampaign[] {
  return readStore()
    .campaigns.map((row) => ({ ...emptyCampaignCopyFields(), ...row }))
    .slice()
    .sort((a, b) => {
      const as = a.start_date || '9999'
      const bs = b.start_date || '9999'
      return as.localeCompare(bs) || a.name.localeCompare(b.name)
    })
}

export function getLocalCampaignDetail(id: string): {
  campaign: CompassCampaign
  milestones: CompassCampaignMilestone[]
  activity: CompassCampaignActivity[]
} | null {
  const store = readStore()
  const campaign = store.campaigns.find((row) => row.id === id)
  if (!campaign) return null
  return {
    campaign: { ...emptyCampaignCopyFields(), ...campaign },
    milestones: (store.milestones[id] ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    activity: store.activity[id] ?? []
  }
}

export function createLocalCampaign(input?: {
  name?: string
  start_date?: string
  end_date?: string
  color?: string
}): CompassCampaign {
  const store = readStore()
  const stamp = nowIso()
  const today = stamp.slice(0, 10)
  const start = input?.start_date || today
  let end = input?.end_date || start
  if (end < start) end = start
  const campaign: CompassCampaign = {
    id: `campaign-${crypto.randomUUID()}`,
    name: input?.name?.trim() || 'New campaign',
    status: 'planned',
    priority: 0,
    health: 'no_updates',
    start_date: start,
    end_date: end,
    color: input?.color || CAMPAIGN_COLORS[Math.floor(Math.random() * CAMPAIGN_COLORS.length)],
    summary: null,
    labels: [],
    owner_label: null,
    ...emptyCampaignCopyFields(),
    created_at: stamp,
    updated_at: stamp
  }
  store.campaigns.push(campaign)
  store.milestones[campaign.id] = []
  store.activity[campaign.id] = []
  pushActivity(store, campaign.id, 'created', `Created campaign “${campaign.name}”`)
  writeStore(store)
  return campaign
}

export function updateLocalCampaign(
  id: string,
  patch: Partial<{
    name: string
    status: string
    priority: number
    health: string
    start_date: string | null
    end_date: string | null
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
  }>
): CompassCampaign | null {
  const store = readStore()
  const index = store.campaigns.findIndex((row) => row.id === id)
  if (index < 0) return null
  const existing = store.campaigns[index]
  const next: CompassCampaign = {
    ...emptyCampaignCopyFields(),
    ...existing,
    updated_at: nowIso()
  }

  if (typeof patch.name === 'string') {
    const name = patch.name.trim()
    if (name && name !== existing.name) {
      next.name = name
      pushActivity(store, id, 'renamed', `Renamed to “${name}”`)
    }
  }
  if (patch.status !== undefined) {
    const status = normalizeCampaignStatus(patch.status)
    if (status !== existing.status) {
      next.status = status
      pushActivity(store, id, 'status', `Changed status to ${status}`)
    }
  }
  if (typeof patch.priority === 'number' && patch.priority !== existing.priority) {
    next.priority = patch.priority
    pushActivity(store, id, 'priority', 'Changed priority')
  }
  if (patch.health !== undefined) {
    const health = normalizeCampaignHealth(patch.health)
    if (health !== existing.health) {
      next.health = health
      pushActivity(store, id, 'health', `Changed health to ${health}`)
    }
  }
  if (patch.start_date !== undefined && patch.start_date !== existing.start_date) {
    next.start_date = patch.start_date
    pushActivity(store, id, 'dates', `Changed start date to ${patch.start_date ?? 'none'}`)
  }
  if (patch.end_date !== undefined && patch.end_date !== existing.end_date) {
    next.end_date = patch.end_date
    pushActivity(store, id, 'dates', `Changed end date to ${patch.end_date ?? 'none'}`)
  }
  if (typeof patch.color === 'string' && patch.color.trim()) next.color = patch.color.trim()
  if (patch.summary !== undefined) next.summary = patch.summary?.trim() || null
  if (patch.labels !== undefined) next.labels = normalizeLabels(patch.labels)
  if (patch.owner_label !== undefined) next.owner_label = patch.owner_label?.trim() || null

  if (patch.instantly_campaign_id !== undefined) {
    next.instantly_campaign_id = patch.instantly_campaign_id?.trim() || null
  }
  if (patch.offer_key !== undefined) next.offer_key = patch.offer_key?.trim() || null
  if (patch.structure_id !== undefined) next.structure_id = patch.structure_id?.trim() || null
  if (patch.opener_mode !== undefined) next.opener_mode = patch.opener_mode?.trim() || 'nick-tier'
  if (patch.vertical_tags !== undefined) next.vertical_tags = normalizeOutboundTagList(patch.vertical_tags)
  if (patch.location_tags !== undefined) next.location_tags = normalizeOutboundTagList(patch.location_tags)
  if (patch.cold_expression !== undefined) {
    next.cold_expression = patch.cold_expression?.trim() || null
  }
  if (patch.sequence_draft !== undefined) {
    if (patch.sequence_draft === null) {
      next.sequence_draft = null
    } else if (isValidSequence(patch.sequence_draft)) {
      next.sequence_draft = patch.sequence_draft
      next.structure_id = patch.sequence_draft.structure_id || next.structure_id
      if (patch.sequence_draft.offer_key) next.offer_key = patch.sequence_draft.offer_key
      const locked = coldExpressionFromSequence(patch.sequence_draft)
      if (locked) next.cold_expression = locked
    }
    pushActivity(store, id, 'copy', 'Updated sequence draft')
  }
  if (patch.copy_status !== undefined) {
    next.copy_status = normalizeCopyStatus(patch.copy_status)
  } else if (patch.sequence_draft !== undefined && next.copy_status === 'none') {
    next.copy_status = 'draft'
  }

  if (next.start_date && next.end_date && next.end_date < next.start_date) {
    next.end_date = next.start_date
  }

  store.campaigns[index] = next
  writeStore(store)
  return next
}

export function deleteLocalCampaign(id: string) {
  const store = readStore()
  store.campaigns = store.campaigns.filter((row) => row.id !== id)
  delete store.milestones[id]
  delete store.activity[id]
  writeStore(store)
}

export function replaceLocalMilestones(
  campaignId: string,
  milestones: Array<{
    id?: string
    title: string
    description?: string | null
    target_date?: string | null
    completed?: boolean
  }>
): CompassCampaignMilestone[] {
  const store = readStore()
  if (!store.campaigns.some((row) => row.id === campaignId)) return []
  const stamp = nowIso()
  const rows: CompassCampaignMilestone[] = milestones
    .map((milestone, index) => {
      const title = milestone.title.trim()
      if (!title) return null
      return {
        id: milestone.id?.startsWith('milestone-')
          ? milestone.id
          : `milestone-${crypto.randomUUID()}`,
        campaign_id: campaignId,
        title,
        description: milestone.description?.trim() || null,
        target_date: milestone.target_date || null,
        sort_order: index,
        completed: Boolean(milestone.completed),
        created_at: stamp,
        updated_at: stamp
      }
    })
    .filter((value): value is CompassCampaignMilestone => Boolean(value))

  store.milestones[campaignId] = rows
  pushActivity(store, campaignId, 'milestones', `Updated milestones (${rows.length})`)
  writeStore(store)
  return rows
}
