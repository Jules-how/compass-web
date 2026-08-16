import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  CAMPAIGN_LIST_COLUMNS,
  defaultGoLiveAt,
  emptyCampaignCopyFields,
  normalizeCtaType,
  normalizeExperimentFactor,
  normalizeOutboundTagList,
  projectCampaignCopy,
  type CompassCampaign,
  type ExperimentFactor
} from '@/lib/campaigns'
import {
  coldExpressionFromSequence,
  isValidSequence,
  type OutboundSequence
} from '@/lib/outbound-copy'

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

type ChallengerBody = {
  name?: string
  factor?: string
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
}

/**
 * Spawn a one-factor challenger from a control (or solo) campaign.
 * Copies copy locks, then applies exactly one factor override.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: parentId } = await context.params

  let body: ChallengerBody
  try {
    body = (await readBoundedJson(request, 256 * 1024)) as ChallengerBody
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const factor = normalizeExperimentFactor(body.factor)
  if (factor === 'none') {
    return portalJson({ error: 'factor_required' }, { status: 400 })
  }

  if (body.sequence_draft != null && !isValidSequence(body.sequence_draft)) {
    return portalJson({ error: 'invalid_sequence' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const parentRes = await supabase
      .from('compass_pipeline_campaigns')
      .select(CAMPAIGN_LIST_COLUMNS)
      .eq('id', parentId)
      .maybeSingle()
    if (parentRes.error) {
      return portalJson({ error: 'fetch_failed', detail: parentRes.error.message }, { status: 500 })
    }
    if (!parentRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const parent = projectCampaign(parentRes.data as CompassCampaign)
    const stamp = nowIso()
    const today = stamp.slice(0, 10)

    // Promote parent to control if it was none/solo.
    if (parent.experiment_role === 'none' || parent.experiment_role === 'solo') {
      await supabase
        .from('compass_pipeline_campaigns')
        .update({
          experiment_role: 'control',
          experiment_status:
            parent.experiment_status === 'none' ? 'queued' : parent.experiment_status,
          updated_at: stamp
        })
        .eq('id', parentId)
    }

    const copyDefaults = emptyCampaignCopyFields()
    let sequenceDraft =
      body.sequence_draft !== undefined
        ? body.sequence_draft
        : parent.sequence_draft
          ? (JSON.parse(JSON.stringify(parent.sequence_draft)) as OutboundSequence)
          : null

    let coldExpression = parent.cold_expression ?? null
    let expressionKey = parent.expression_key ?? null
    let structureId = parent.structure_id ?? null
    let offerKey = parent.offer_key ?? null
    let verticalTags = [...(parent.vertical_tags ?? [])]
    let locationTags = [...(parent.location_tags ?? [])]
    let ctaType = parent.cta_type ?? null

    applyFactorOverride(factor, body, {
      setCtaType: (v) => {
        ctaType = v
      },
      setColdExpression: (v) => {
        coldExpression = v
      },
      setExpressionKey: (v) => {
        expressionKey = v
      },
      setStructureId: (v) => {
        structureId = v
      },
      setOfferKey: (v) => {
        offerKey = v
      },
      setVerticalTags: (v) => {
        verticalTags = v
      },
      setLocationTags: (v) => {
        locationTags = v
      },
      setSequenceDraft: (v) => {
        sequenceDraft = v
      }
    })

    if (sequenceDraft) {
      const locked = coldExpressionFromSequence(sequenceDraft)
      if (locked) coldExpression = locked
      if (!structureId) structureId = sequenceDraft.structure_id
      if (!offerKey && sequenceDraft.offer_key) offerKey = sequenceDraft.offer_key
    }

    const hypothesis =
      (body.hypothesis?.trim() || null) ||
      parent.hypothesis ||
      `Test whether ${factor} change beats control.`

    const name =
      body.name?.trim() || `${parent.name} · ${factor} test`

    const sampleTarget =
      typeof body.sample_size_target === 'number' && Number.isFinite(body.sample_size_target)
        ? Math.max(0, Math.floor(body.sample_size_target))
        : parent.sample_size_target ?? 150

    const row = {
      id: `campaign-${crypto.randomUUID()}`,
      name,
      status: 'planned',
      priority: parent.priority,
      health: 'no_updates',
      start_date: today,
      end_date: parent.end_date || today,
      go_live_at: parent.go_live_at || defaultGoLiveAt(),
      color: parent.color || '#94a3b8',
      summary: parent.summary,
      labels: parent.labels ?? [],
      owner_label: parent.owner_label,
      ...copyDefaults,
      instantly_campaign_id: null,
      offer_key: offerKey,
      structure_id: structureId,
      opener_mode: parent.opener_mode || copyDefaults.opener_mode,
      vertical_tags: verticalTags,
      location_tags: locationTags,
      cold_expression: coldExpression,
      sequence_draft: sequenceDraft,
      copy_status: sequenceDraft ? 'draft' : parent.copy_status || 'none',
      hypothesis,
      experiment_factor: factor,
      experiment_role: 'challenger',
      parent_campaign_id: parentId,
      experiment_status: 'queued',
      sample_size_target: sampleTarget,
      experiment_decision: null,
      expression_key: expressionKey,
      cta_type: ctaType,
      created_at: stamp,
      updated_at: stamp
    }

    const { data, error } = await supabase
      .from('compass_pipeline_campaigns')
      .insert(row)
      .select(CAMPAIGN_LIST_COLUMNS)
      .single()
    if (error) {
      return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
    }

    await supabase.from('compass_pipeline_activity').insert([
      {
        id: `cact-${crypto.randomUUID()}`,
        campaign_id: row.id,
        actor: 'operator',
        action: 'spawn_challenger',
        body: `Spawned as ${factor} challenger of “${parent.name}”`,
        created_at: stamp
      },
      {
        id: `cact-${crypto.randomUUID()}`,
        campaign_id: parentId,
        actor: 'operator',
        action: 'spawn_challenger',
        body: `Spawned challenger “${name}” (${factor})`,
        created_at: stamp
      }
    ])

    return portalJson(projectCampaign(data as CompassCampaign), { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}

function applyFactorOverride(
  factor: ExperimentFactor,
  body: ChallengerBody,
  setters: {
    setCtaType: (v: string | null) => void
    setColdExpression: (v: string | null) => void
    setExpressionKey: (v: string | null) => void
    setStructureId: (v: string | null) => void
    setOfferKey: (v: string | null) => void
    setVerticalTags: (v: string[]) => void
    setLocationTags: (v: string[]) => void
    setSequenceDraft: (v: OutboundSequence | null) => void
  }
) {
  if (factor === 'cta') {
    setters.setCtaType(normalizeCtaType(body.cta_type) || body.cta_type?.trim() || 'timed_call')
    if (body.sequence_draft) setters.setSequenceDraft(body.sequence_draft)
    return
  }
  if (factor === 'expression') {
    if (body.cold_expression !== undefined) {
      setters.setColdExpression(body.cold_expression?.trim() || null)
    }
    if (body.expression_key !== undefined) {
      setters.setExpressionKey(body.expression_key?.trim() || null)
    }
    if (body.sequence_draft) setters.setSequenceDraft(body.sequence_draft)
    return
  }
  if (factor === 'structure') {
    if (body.structure_id !== undefined) {
      setters.setStructureId(body.structure_id?.trim() || null)
    }
    if (body.sequence_draft) setters.setSequenceDraft(body.sequence_draft)
    return
  }
  if (factor === 'offer') {
    if (body.offer_key !== undefined) {
      setters.setOfferKey(body.offer_key?.trim() || null)
    }
    return
  }
  if (factor === 'audience') {
    if (body.vertical_tags !== undefined) {
      setters.setVerticalTags(normalizeOutboundTagList(body.vertical_tags))
    }
    if (body.location_tags !== undefined) {
      setters.setLocationTags(normalizeOutboundTagList(body.location_tags))
    }
  }
}
