import type { NextRequest } from 'next/server'
import {
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  emptyCampaignCopyFields,
  normalizeCampaignHealth,
  normalizeCampaignStatus,
  normalizeLabels,
  normalizeOutboundTagList,
  parseGoLiveAt,
  projectCampaignCopy,
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
import {
  buildWaveSnapshot,
  summarizeWaveLeads,
  type WaveSnapshot
} from '@/lib/campaign-wave'
import {
  getLocalDb,
  getPipelineCampaigns,
  upsertPipelineCampaign,
  deletePipelineCampaign,
  addPipelineActivity
} from '@/lib/local-db'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

function projectCampaign(row: CompassCampaign): CompassCampaign {
  return projectCampaignCopy({
    ...emptyCampaignCopyFields(),
    ...row,
    labels: Array.isArray(row.labels) ? row.labels : [],
    priority: typeof row.priority === 'number' ? row.priority : 0,
    health: row.health || 'no_updates',
    color: row.color || '#94a3b8'
  })
}

function loadWaveForCampaign(campaign: CompassCampaign): WaveSnapshot {
  const db = getLocalDb()
  const rows = db.prepare(`
    SELECT enrich_status, opener, email, company, outbound_status, opener_track, opener_kind, icp_status
    FROM lead_contacts
    WHERE pipeline_campaign_id = ?
    LIMIT 5000
  `).all(campaign.id) as Array<{
    enrich_status: string | null
    opener: string | null
    email: string | null
    company: string | null
    outbound_status: string | null
    opener_track: string | null
    opener_kind: string | null
    icp_status: string | null
  }>

  const leads = summarizeWaveLeads(rows)
  return buildWaveSnapshot({ campaign, leads, instantly: null, includeCopyMatch: true })
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    const db = getLocalDb()
    const allCampaigns = getPipelineCampaigns()
    const campaign = allCampaigns.find((c) => c.id === id)

    if (!campaign) {
      return portalJson({ error: 'not_found' }, { status: 404 })
    }

    const activity = db.prepare(`
      SELECT id, campaign_id, kind, message, created_at
      FROM compass_pipeline_activity
      WHERE campaign_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(id) as unknown as CompassCampaignActivity[]

    const wave = loadWaveForCampaign(campaign)

    return portalJsonCached({
      campaign: projectCampaign(campaign),
      milestones: [],
      activity,
      wave
    }, {}, 5)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch_failed'
    return portalJson({ error: 'fetch_failed', detail: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request, 256 * 1024)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const allCampaigns = getPipelineCampaigns()
    const existing = allCampaigns.find((c) => c.id === id)
    if (!existing) {
      return portalJson({ error: 'not_found' }, { status: 404 })
    }

    const updated = upsertPipelineCampaign({
      ...existing,
      ...(body as Partial<CompassCampaign>),
      id,
      name: typeof body.name === 'string' ? body.name.trim() : existing.name
    })

    addPipelineActivity(id, 'campaign_updated', `Campaign "${updated.name}" updated`, {
      name: updated.name
    })

    return portalJson({ campaign: projectCampaign(updated) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update_failed'
    return portalJson({ error: 'update_failed', detail: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const { id } = await context.params

  try {
    deletePipelineCampaign(id)
    return portalJson({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'delete_failed'
    return portalJson({ error: 'delete_failed', detail: message }, { status: 500 })
  }
}
