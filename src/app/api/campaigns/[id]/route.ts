import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  CAMPAIGN_ACTIVITY_COLUMNS,
  CAMPAIGN_LIST_COLUMNS,
  CAMPAIGN_MILESTONE_COLUMNS,
  emptyCampaignCopyFields,
  dateOnlyInZone,
  normalizeCampaignHealth,
  normalizeCampaignStatus,
  normalizeCtaType,
  normalizeExperimentFactor,
  normalizeExperimentRole,
  normalizeExperimentStatus,
  normalizeLabels,
  normalizeOutboundTagList,
  parseGoLiveAt,
  projectCampaignCopy,
  validateExperimentWrite,
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
  copyPatchClearsConfirm,
  summarizeWaveLeads,
  type WaveSnapshot
} from '@/lib/campaign-wave'
import {
  deleteCampaignGoogleCalendarEvent,
  syncCampaignToGoogleCalendarQuiet
} from '@/lib/campaign-google-calendar'
import {
  fetchInstantlyCampaignAnalytics,
  resolveInstantlyApiKey
} from '@/lib/instantly'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

function nowIso(): string {
  return new Date().toISOString()
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

async function loadWaveForCampaign(
  supabase: SupabaseClient,
  campaign: CompassCampaign
): Promise<WaveSnapshot> {
  const leadsRes = await supabase
    .from('lead_contacts')
    .select('enrich_status,opener,email,company,outbound_status,opener_track,opener_kind')
    .eq('pipeline_campaign_id', campaign.id)
    .limit(5000)
  const rows = Array.isArray(leadsRes.data) ? leadsRes.data : []
  const leads = summarizeWaveLeads(rows)
  let instantly: { sent: number; bounced: number } | null = null
  const instantlyId = campaign.instantly_campaign_id?.trim()
  if (instantlyId) {
    try {
      const apiKey = await resolveInstantlyApiKey(supabase)
      if (apiKey) {
        const analytics = await fetchInstantlyCampaignAnalytics(apiKey, instantlyId)
        const row = analytics[0]
        if (row) {
          instantly = {
            sent: Math.max(0, Number(row.emails_sent_count) || 0),
            bounced: Math.max(0, Number(row.bounced_count) || 0)
          }
        }
      }
    } catch {
      instantly = null
    }
  }
  return buildWaveSnapshot({ campaign, leads, instantly, includeCopyMatch: true })
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [campaignRes, milestonesRes, activityRes] = await Promise.all([
      supabase.from('compass_pipeline_campaigns').select(CAMPAIGN_LIST_COLUMNS).eq('id', id).maybeSingle(),
      supabase
        .from('compass_pipeline_milestones')
        .select(CAMPAIGN_MILESTONE_COLUMNS)
        .eq('campaign_id', id)
        .order('sort_order'),
      supabase
        .from('compass_pipeline_activity')
        .select(CAMPAIGN_ACTIVITY_COLUMNS)
        .eq('campaign_id', id)
        .order('created_at', { ascending: false })
        .limit(40)
    ])

    if (campaignRes.error || milestonesRes.error || activityRes.error) {
      return portalJson({ error: 'fetch_failed' }, { status: 500 })
    }
    if (!campaignRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const campaign = projectCampaign(campaignRes.data as CompassCampaign)
    const wave = await loadWaveForCampaign(supabase, campaign)

    return portalJsonCached({
      campaign: {
        ...campaign,
        wave_cohort_count: wave.cohort,
        wave_positive_count: wave.positive,
        wave_meeting_count: wave.meetings
      },
      milestones: (milestonesRes.data ?? []) as CompassCampaignMilestone[],
      activity: (activityRes.data ?? []) as CompassCampaignActivity[],
      wave
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  let body: {
    name?: string
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
    sequence_draft?: OutboundSequence | null
    copy_status?: string
    hypothesis?: string | null
    experiment_factor?: string
    experiment_role?: string
    parent_campaign_id?: string | null
    experiment_status?: string
    sample_size_target?: number | null
    experiment_decision?: string | null
    expression_key?: string | null
    cta_type?: string | null
    opener_reviewed_at?: string | null
    copy_confirmed_at?: string | null
  }
  try {
    body = (await readBoundedJson(request, 256 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const existingRes = await supabase
      .from('compass_pipeline_campaigns')
      .select(CAMPAIGN_LIST_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (existingRes.error) {
      return portalJson({ error: 'fetch_failed', detail: existingRes.error.message }, { status: 500 })
    }
    if (!existingRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const existing = projectCampaign(existingRes.data as CompassCampaign)
    const stamp = nowIso()
    const patch: Record<string, unknown> = { updated_at: stamp }
    const activity: Array<{ action: string; body: string }> = []

    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
      if (name !== existing.name) {
        patch.name = name
        activity.push({ action: 'renamed', body: `Renamed to “${name}”` })
      }
    }
    if (body.status !== undefined) {
      const status = normalizeCampaignStatus(body.status)
      if (status !== existing.status) {
        patch.status = status
        activity.push({ action: 'status', body: `Changed status to ${status}` })
      }
    }
    if (typeof body.priority === 'number' && body.priority !== existing.priority) {
      patch.priority = body.priority
      activity.push({ action: 'priority', body: `Changed priority` })
    }
    if (body.health !== undefined) {
      const health = normalizeCampaignHealth(body.health)
      if (health !== existing.health) {
        patch.health = health
        activity.push({ action: 'health', body: `Changed health to ${health}` })
      }
    }
    if (body.start_date !== undefined) {
      const start = body.start_date || null
      if (start !== existing.start_date) {
        patch.start_date = start
        activity.push({
          action: 'dates',
          body: `Changed start date to ${start ?? 'none'}`
        })
      }
    }
    if (body.end_date !== undefined) {
      const end = body.end_date || null
      if (end !== existing.end_date) {
        patch.end_date = end
        activity.push({
          action: 'dates',
          body: `Changed end date to ${end ?? 'none'}`
        })
      }
    }
    if (body.go_live_at !== undefined) {
      const parsed = parseGoLiveAt(body.go_live_at)
      if (!parsed.ok) return portalJson({ error: 'invalid_go_live_at' }, { status: 400 })
      if (parsed.iso !== existing.go_live_at) {
        patch.go_live_at = parsed.iso
        if (parsed.iso) patch.start_date = dateOnlyInZone(parsed.iso)
        activity.push({
          action: 'dates',
          body: `Changed go-live to ${parsed.iso ?? 'none'}`
        })
      }
    }
    if (typeof body.color === 'string' && body.color.trim()) {
      patch.color = body.color.trim()
    }
    if (body.summary !== undefined) {
      patch.summary = body.summary?.trim() || null
    }
    if (body.labels !== undefined) {
      patch.labels = normalizeLabels(body.labels)
    }
    if (body.owner_label !== undefined) {
      patch.owner_label = body.owner_label?.trim() || null
    }
    if (body.instantly_campaign_id !== undefined) {
      patch.instantly_campaign_id = body.instantly_campaign_id?.trim() || null
    }
    if (body.offer_key !== undefined) patch.offer_key = body.offer_key?.trim() || null
    if (body.structure_id !== undefined) patch.structure_id = body.structure_id?.trim() || null
    if (body.opener_mode !== undefined) {
      patch.opener_mode = body.opener_mode?.trim() || 'nick-tier'
    }
    if (body.vertical_tags !== undefined) {
      patch.vertical_tags = normalizeOutboundTagList(body.vertical_tags)
    }
    if (body.location_tags !== undefined) {
      patch.location_tags = normalizeOutboundTagList(body.location_tags)
    }
    if (body.cold_expression !== undefined) {
      patch.cold_expression = body.cold_expression?.trim() || null
    }
    if (body.sequence_draft !== undefined) {
      if (body.sequence_draft === null) {
        patch.sequence_draft = null
      } else if (!isValidSequence(body.sequence_draft)) {
        return portalJson({ error: 'invalid_sequence' }, { status: 400 })
      } else {
        patch.sequence_draft = body.sequence_draft
        patch.structure_id = body.sequence_draft.structure_id
        if (body.sequence_draft.offer_key) patch.offer_key = body.sequence_draft.offer_key
        const locked = coldExpressionFromSequence(body.sequence_draft)
        if (locked) patch.cold_expression = locked
      }
      activity.push({ action: 'copy', body: 'Updated sequence draft' })
    }
    if (body.copy_status !== undefined) {
      patch.copy_status = normalizeCopyStatus(body.copy_status)
    } else if (body.sequence_draft !== undefined && (existing.copy_status ?? 'none') === 'none') {
      patch.copy_status = 'draft'
    }

    if (body.hypothesis !== undefined) {
      patch.hypothesis = body.hypothesis?.trim() || null
      if (patch.hypothesis !== existing.hypothesis) {
        activity.push({ action: 'hypothesis_set', body: 'Updated experiment hypothesis' })
      }
    }
    if (body.experiment_factor !== undefined) {
      patch.experiment_factor = normalizeExperimentFactor(body.experiment_factor)
    }
    if (body.experiment_role !== undefined) {
      patch.experiment_role = normalizeExperimentRole(body.experiment_role)
    }
    if (body.parent_campaign_id !== undefined) {
      patch.parent_campaign_id = body.parent_campaign_id?.trim() || null
    }
    if (body.experiment_status !== undefined) {
      const nextStatus = normalizeExperimentStatus(body.experiment_status)
      if (nextStatus !== existing.experiment_status) {
        patch.experiment_status = nextStatus
        activity.push({
          action: 'experiment_status',
          body: `Experiment status → ${nextStatus}`
        })
      }
    }
    if (body.sample_size_target !== undefined) {
      if (body.sample_size_target === null) {
        patch.sample_size_target = null
      } else if (typeof body.sample_size_target === 'number' && Number.isFinite(body.sample_size_target)) {
        patch.sample_size_target = Math.max(0, Math.floor(body.sample_size_target))
      }
    }
    if (body.experiment_decision !== undefined) {
      patch.experiment_decision = body.experiment_decision?.trim() || null
    }
    if (body.expression_key !== undefined) {
      patch.expression_key = body.expression_key?.trim() || null
    }
    if (body.cta_type !== undefined) {
      patch.cta_type = normalizeCtaType(body.cta_type)
    }
    if (body.opener_reviewed_at !== undefined) {
      if (body.opener_reviewed_at === null || body.opener_reviewed_at === '') {
        patch.opener_reviewed_at = null
      } else if (typeof body.opener_reviewed_at === 'string') {
        patch.opener_reviewed_at = body.opener_reviewed_at
      }
    }
    if (body.copy_confirmed_at !== undefined) {
      if (body.copy_confirmed_at === null || body.copy_confirmed_at === '') {
        patch.copy_confirmed_at = null
      } else if (typeof body.copy_confirmed_at === 'string') {
        patch.copy_confirmed_at = body.copy_confirmed_at
      }
    } else if (copyPatchClearsConfirm(body) && existing.copy_confirmed_at) {
      patch.copy_confirmed_at = null
    }

    const mergedRole = normalizeExperimentRole(
      (patch.experiment_role as string | undefined) ?? existing.experiment_role
    )
    const mergedFactor = normalizeExperimentFactor(
      (patch.experiment_factor as string | undefined) ?? existing.experiment_factor
    )
    const mergedStatus = normalizeExperimentStatus(
      (patch.experiment_status as string | undefined) ?? existing.experiment_status
    )
    const mergedParent =
      patch.parent_campaign_id !== undefined
        ? (patch.parent_campaign_id as string | null)
        : existing.parent_campaign_id
    const mergedHypothesis =
      patch.hypothesis !== undefined ? (patch.hypothesis as string | null) : existing.hypothesis
    const experimentError = validateExperimentWrite({
      experiment_role: mergedRole,
      experiment_factor: mergedFactor,
      experiment_status: mergedStatus,
      parent_campaign_id: mergedParent,
      hypothesis: mergedHypothesis
    })
    if (experimentError) {
      return portalJson({ error: experimentError }, { status: 400 })
    }

    // Keep end >= start when both present after patch.
    const nextStart =
      (patch.start_date as string | null | undefined) !== undefined
        ? (patch.start_date as string | null)
        : existing.start_date
    const nextEnd =
      (patch.end_date as string | null | undefined) !== undefined
        ? (patch.end_date as string | null)
        : existing.end_date
    if (nextStart && nextEnd && nextEnd < nextStart) {
      patch.end_date = nextStart
    }

    const { data, error } = await supabase
      .from('compass_pipeline_campaigns')
      .update(patch)
      .eq('id', id)
      .select(CAMPAIGN_LIST_COLUMNS)
      .single()

    if (error) {
      return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    }

    if (activity.length > 0) {
      await supabase.from('compass_pipeline_activity').insert(
        activity.map((item) => ({
          id: `cact-${crypto.randomUUID()}`,
          campaign_id: id,
          actor: 'operator',
          action: item.action,
          body: item.body,
          created_at: stamp
        }))
      )
    }

    const updated = projectCampaign(data as CompassCampaign)
    if (
      patch.name !== undefined ||
      patch.status !== undefined ||
      patch.go_live_at !== undefined ||
      patch.summary !== undefined
    ) {
      await syncCampaignToGoogleCalendarQuiet(supabase, updated)
    }
    return portalJson(updated)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const existingRes = await supabase
      .from('compass_pipeline_campaigns')
      .select('google_calendar_event_id')
      .eq('id', id)
      .maybeSingle()
    await deleteCampaignGoogleCalendarEvent(
      supabase,
      typeof existingRes.data?.google_calendar_event_id === 'string'
        ? existingRes.data.google_calendar_event_id
        : null
    )
    const { error } = await supabase.from('compass_pipeline_campaigns').delete().eq('id', id)
    if (error) {
      return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })
    }
    return portalJson({ ok: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
