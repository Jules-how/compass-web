import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { META_AD_COLUMNS, META_AD_SET_COLUMNS, META_CAMPAIGN_COLUMNS } from '@/lib/list-columns'
import { nowIso, recordClientActivity } from '@/lib/client-data'
import {
  META_BID_STRATEGIES,
  META_BILLING_EVENTS,
  META_BUYING_TYPES,
  META_DESTINATION_TYPES,
  META_GENDERS,
  META_PLACEMENTS,
  normalizeMetaBudgetType,
  normalizeMetaCta,
  normalizeMetaFormat,
  normalizeMetaObjective,
  normalizeMetaOptimizationGoal,
  normalizeMetaStatus,
  normalizeSpecialCategories,
  type MetaBidStrategy,
  type MetaBillingEvent,
  type MetaBuyingType,
  type MetaDestinationType,
  type MetaGender,
  type MetaPlacement
} from '@/lib/meta-ads'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

type MetaKind = 'campaign' | 'ad_set' | 'ad'

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asInt(value: unknown, fallback: number): number {
  const n = asNumber(value)
  if (n == null) return fallback
  return Math.round(n)
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T
  }
  return fallback
}

async function assertClient(
  supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase'],
  clientId: string
) {
  const res = await supabase.from('compass_clients').select('id').eq('id', clientId).maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return Boolean(res.data)
}

async function assertCampaign(
  supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase'],
  clientId: string,
  campaignId: string
) {
  const res = await supabase
    .from('compass_meta_campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return Boolean(res.data)
}

async function assertAdSet(
  supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase'],
  clientId: string,
  adSetId: string
) {
  const res = await supabase
    .from('compass_meta_ad_sets')
    .select('id')
    .eq('id', adSetId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return Boolean(res.data)
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId } = await context.params

  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const kind = body.kind as MetaKind | undefined
  if (!kind || !['campaign', 'ad_set', 'ad'].includes(kind)) {
    return portalJson({ error: 'kind_required' }, { status: 400 })
  }

  const stamp = nowIso()

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    if (!(await assertClient(supabase, clientId))) {
      return portalJson({ error: 'not_found' }, { status: 404 })
    }

    if (kind === 'campaign') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
      const budgetType = normalizeMetaBudgetType(body.budget_type as string | undefined, 'none')
      const row = {
        id: `mcamp-${crypto.randomUUID()}`,
        client_id: clientId,
        name,
        objective: normalizeMetaObjective(body.objective as string | undefined),
        status: normalizeMetaStatus(body.status as string | undefined),
        buying_type: pickEnum(body.buying_type, META_BUYING_TYPES, 'auction' as MetaBuyingType),
        special_ad_categories: normalizeSpecialCategories(body.special_ad_categories),
        budget_type: budgetType,
        daily_budget: budgetType === 'daily' ? asNumber(body.daily_budget) : null,
        lifetime_budget: budgetType === 'lifetime' ? asNumber(body.lifetime_budget) : null,
        currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'AUD',
        notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
        created_at: stamp,
        updated_at: stamp
      }
      const { data, error } = await supabase
        .from('compass_meta_campaigns')
        .insert(row)
        .select(META_CAMPAIGN_COLUMNS)
        .single()
      if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
      await recordClientActivity(supabase, {
        clientId,
        action: 'meta_campaign_created',
        body: `Created Meta campaign: ${name}`
      })
      return portalJson(data, { status: 201 })
    }

    if (kind === 'ad_set') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id.trim() : ''
      if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
      if (!campaignId) return portalJson({ error: 'campaign_id_required' }, { status: 400 })
      if (!(await assertCampaign(supabase, clientId, campaignId))) {
        return portalJson({ error: 'campaign_not_found' }, { status: 404 })
      }
      const budgetType = normalizeMetaBudgetType(body.budget_type as string | undefined, 'daily')
      const row = {
        id: `madset-${crypto.randomUUID()}`,
        client_id: clientId,
        campaign_id: campaignId,
        name,
        status: normalizeMetaStatus(body.status as string | undefined),
        optimization_goal: normalizeMetaOptimizationGoal(body.optimization_goal as string | undefined),
        billing_event: pickEnum(body.billing_event, META_BILLING_EVENTS, 'IMPRESSIONS' as MetaBillingEvent),
        bid_strategy: pickEnum(
          body.bid_strategy,
          META_BID_STRATEGIES,
          'LOWEST_COST_WITHOUT_CAP' as MetaBidStrategy
        ),
        budget_type: budgetType === 'none' ? 'daily' : budgetType,
        daily_budget: budgetType !== 'lifetime' ? asNumber(body.daily_budget) : null,
        lifetime_budget: budgetType === 'lifetime' ? asNumber(body.lifetime_budget) : null,
        currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'AUD',
        start_date: typeof body.start_date === 'string' && body.start_date.trim() ? body.start_date : null,
        end_date: typeof body.end_date === 'string' && body.end_date.trim() ? body.end_date : null,
        age_min: asInt(body.age_min, 18),
        age_max: asInt(body.age_max, 65),
        genders: pickEnum(body.genders, META_GENDERS, 'all' as MetaGender),
        locations: typeof body.locations === 'string' ? body.locations.trim() || null : null,
        detailed_targeting:
          typeof body.detailed_targeting === 'string' ? body.detailed_targeting.trim() || null : null,
        placements: pickEnum(body.placements, META_PLACEMENTS, 'advantage_plus' as MetaPlacement),
        placement_notes:
          typeof body.placement_notes === 'string' ? body.placement_notes.trim() || null : null,
        destination_type: pickEnum(
          body.destination_type,
          META_DESTINATION_TYPES,
          'WEBSITE' as MetaDestinationType
        ),
        notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
        created_at: stamp,
        updated_at: stamp
      }
      const { data, error } = await supabase
        .from('compass_meta_ad_sets')
        .insert(row)
        .select(META_AD_SET_COLUMNS)
        .single()
      if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
      await recordClientActivity(supabase, {
        clientId,
        action: 'meta_ad_set_created',
        body: `Created Meta ad set: ${name}`
      })
      return portalJson(data, { status: 201 })
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const adSetId = typeof body.ad_set_id === 'string' ? body.ad_set_id.trim() : ''
    if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
    if (!adSetId) return portalJson({ error: 'ad_set_id_required' }, { status: 400 })
    if (!(await assertAdSet(supabase, clientId, adSetId))) {
      return portalJson({ error: 'ad_set_not_found' }, { status: 404 })
    }
    const row = {
      id: `mad-${crypto.randomUUID()}`,
      client_id: clientId,
      ad_set_id: adSetId,
      name,
      status: normalizeMetaStatus(body.status as string | undefined),
      format: normalizeMetaFormat(body.format as string | undefined),
      primary_text: typeof body.primary_text === 'string' ? body.primary_text.trim() || null : null,
      headline: typeof body.headline === 'string' ? body.headline.trim() || null : null,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      call_to_action: normalizeMetaCta(body.call_to_action as string | undefined),
      destination_url:
        typeof body.destination_url === 'string' ? body.destination_url.trim() || null : null,
      display_link: typeof body.display_link === 'string' ? body.display_link.trim() || null : null,
      media_notes: typeof body.media_notes === 'string' ? body.media_notes.trim() || null : null,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      created_at: stamp,
      updated_at: stamp
    }
    const { data, error } = await supabase
      .from('compass_meta_ads')
      .insert(row)
      .select(META_AD_COLUMNS)
      .single()
    if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
    await recordClientActivity(supabase, {
      clientId,
      action: 'meta_ad_created',
      body: `Created Meta ad: ${name}`
    })
    return portalJson(data, { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId } = await context.params

  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const kind = body.kind as MetaKind | undefined
  const rowId = typeof body.id === 'string' ? body.id.trim() : ''
  if (!kind || !rowId) return portalJson({ error: 'id_required' }, { status: 400 })
  const stamp = nowIso()

  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    if (kind === 'campaign') {
      const patch: Record<string, unknown> = { updated_at: stamp }
      if (typeof body.name === 'string') {
        const name = body.name.trim()
        if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
        patch.name = name
      }
      if (typeof body.objective === 'string') patch.objective = normalizeMetaObjective(body.objective)
      if (typeof body.status === 'string') patch.status = normalizeMetaStatus(body.status)
      if (typeof body.buying_type === 'string') {
        patch.buying_type = pickEnum(body.buying_type, META_BUYING_TYPES, 'auction')
      }
      if (Object.prototype.hasOwnProperty.call(body, 'special_ad_categories')) {
        patch.special_ad_categories = normalizeSpecialCategories(body.special_ad_categories)
      }
      if (typeof body.budget_type === 'string') {
        patch.budget_type = normalizeMetaBudgetType(body.budget_type, 'none')
      }
      if (Object.prototype.hasOwnProperty.call(body, 'daily_budget')) {
        patch.daily_budget = asNumber(body.daily_budget)
      }
      if (Object.prototype.hasOwnProperty.call(body, 'lifetime_budget')) {
        patch.lifetime_budget = asNumber(body.lifetime_budget)
      }
      if (typeof body.currency === 'string') patch.currency = body.currency.trim() || 'AUD'
      if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
        patch.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
      }

      const { data, error } = await supabase
        .from('compass_meta_campaigns')
        .update(patch)
        .eq('id', rowId)
        .eq('client_id', clientId)
        .select(META_CAMPAIGN_COLUMNS)
        .maybeSingle()
      if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
      if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
      await recordClientActivity(supabase, {
        clientId,
        action: 'meta_campaign_updated',
        body: `Updated Meta campaign: ${data.name}`
      })
      return portalJson(data)
    }

    if (kind === 'ad_set') {
      const patch: Record<string, unknown> = { updated_at: stamp }
      if (typeof body.name === 'string') {
        const name = body.name.trim()
        if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
        patch.name = name
      }
      if (typeof body.campaign_id === 'string') {
        const campaignId = body.campaign_id.trim()
        if (!(await assertCampaign(supabase, clientId, campaignId))) {
          return portalJson({ error: 'campaign_not_found' }, { status: 404 })
        }
        patch.campaign_id = campaignId
      }
      if (typeof body.status === 'string') patch.status = normalizeMetaStatus(body.status)
      if (typeof body.optimization_goal === 'string') {
        patch.optimization_goal = normalizeMetaOptimizationGoal(body.optimization_goal)
      }
      if (typeof body.billing_event === 'string') {
        patch.billing_event = pickEnum(body.billing_event, META_BILLING_EVENTS, 'IMPRESSIONS')
      }
      if (typeof body.bid_strategy === 'string') {
        patch.bid_strategy = pickEnum(
          body.bid_strategy,
          META_BID_STRATEGIES,
          'LOWEST_COST_WITHOUT_CAP'
        )
      }
      if (typeof body.budget_type === 'string') {
        const budgetType = normalizeMetaBudgetType(body.budget_type, 'daily')
        patch.budget_type = budgetType === 'none' ? 'daily' : budgetType
      }
      if (Object.prototype.hasOwnProperty.call(body, 'daily_budget')) {
        patch.daily_budget = asNumber(body.daily_budget)
      }
      if (Object.prototype.hasOwnProperty.call(body, 'lifetime_budget')) {
        patch.lifetime_budget = asNumber(body.lifetime_budget)
      }
      if (typeof body.currency === 'string') patch.currency = body.currency.trim() || 'AUD'
      if (Object.prototype.hasOwnProperty.call(body, 'start_date')) {
        patch.start_date =
          typeof body.start_date === 'string' && body.start_date.trim() ? body.start_date : null
      }
      if (Object.prototype.hasOwnProperty.call(body, 'end_date')) {
        patch.end_date =
          typeof body.end_date === 'string' && body.end_date.trim() ? body.end_date : null
      }
      if (Object.prototype.hasOwnProperty.call(body, 'age_min')) patch.age_min = asInt(body.age_min, 18)
      if (Object.prototype.hasOwnProperty.call(body, 'age_max')) patch.age_max = asInt(body.age_max, 65)
      if (typeof body.genders === 'string') patch.genders = pickEnum(body.genders, META_GENDERS, 'all')
      if (Object.prototype.hasOwnProperty.call(body, 'locations')) {
        patch.locations = typeof body.locations === 'string' ? body.locations.trim() || null : null
      }
      if (Object.prototype.hasOwnProperty.call(body, 'detailed_targeting')) {
        patch.detailed_targeting =
          typeof body.detailed_targeting === 'string' ? body.detailed_targeting.trim() || null : null
      }
      if (typeof body.placements === 'string') {
        patch.placements = pickEnum(body.placements, META_PLACEMENTS, 'advantage_plus')
      }
      if (Object.prototype.hasOwnProperty.call(body, 'placement_notes')) {
        patch.placement_notes =
          typeof body.placement_notes === 'string' ? body.placement_notes.trim() || null : null
      }
      if (typeof body.destination_type === 'string') {
        patch.destination_type = pickEnum(body.destination_type, META_DESTINATION_TYPES, 'WEBSITE')
      }
      if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
        patch.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
      }

      const { data, error } = await supabase
        .from('compass_meta_ad_sets')
        .update(patch)
        .eq('id', rowId)
        .eq('client_id', clientId)
        .select(META_AD_SET_COLUMNS)
        .maybeSingle()
      if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
      if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
      await recordClientActivity(supabase, {
        clientId,
        action: 'meta_ad_set_updated',
        body: `Updated Meta ad set: ${data.name}`
      })
      return portalJson(data)
    }

    if (kind !== 'ad') return portalJson({ error: 'kind_required' }, { status: 400 })

    const patch: Record<string, unknown> = { updated_at: stamp }
    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
      patch.name = name
    }
    if (typeof body.ad_set_id === 'string') {
      const adSetId = body.ad_set_id.trim()
      if (!(await assertAdSet(supabase, clientId, adSetId))) {
        return portalJson({ error: 'ad_set_not_found' }, { status: 404 })
      }
      patch.ad_set_id = adSetId
    }
    if (typeof body.status === 'string') patch.status = normalizeMetaStatus(body.status)
    if (typeof body.format === 'string') patch.format = normalizeMetaFormat(body.format)
    if (Object.prototype.hasOwnProperty.call(body, 'primary_text')) {
      patch.primary_text =
        typeof body.primary_text === 'string' ? body.primary_text.trim() || null : null
    }
    if (Object.prototype.hasOwnProperty.call(body, 'headline')) {
      patch.headline = typeof body.headline === 'string' ? body.headline.trim() || null : null
    }
    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
      patch.description =
        typeof body.description === 'string' ? body.description.trim() || null : null
    }
    if (typeof body.call_to_action === 'string') {
      patch.call_to_action = normalizeMetaCta(body.call_to_action)
    }
    if (Object.prototype.hasOwnProperty.call(body, 'destination_url')) {
      patch.destination_url =
        typeof body.destination_url === 'string' ? body.destination_url.trim() || null : null
    }
    if (Object.prototype.hasOwnProperty.call(body, 'display_link')) {
      patch.display_link =
        typeof body.display_link === 'string' ? body.display_link.trim() || null : null
    }
    if (Object.prototype.hasOwnProperty.call(body, 'media_notes')) {
      patch.media_notes =
        typeof body.media_notes === 'string' ? body.media_notes.trim() || null : null
    }
    if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
      patch.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
    }

    const { data, error } = await supabase
      .from('compass_meta_ads')
      .update(patch)
      .eq('id', rowId)
      .eq('client_id', clientId)
      .select(META_AD_COLUMNS)
      .maybeSingle()
    if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    await recordClientActivity(supabase, {
      clientId,
      action: 'meta_ad_updated',
      body: `Updated Meta ad: ${data.name}`
    })
    return portalJson(data)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId } = await context.params

  let body: { kind?: MetaKind; id?: string }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const kind = body.kind
  const rowId = body.id?.trim()
  if (!kind || !rowId) return portalJson({ error: 'id_required' }, { status: 400 })

  const table =
    kind === 'campaign'
      ? 'compass_meta_campaigns'
      : kind === 'ad_set'
        ? 'compass_meta_ad_sets'
        : kind === 'ad'
          ? 'compass_meta_ads'
          : null
  if (!table) return portalJson({ error: 'kind_required' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { error } = await supabase.from(table).delete().eq('id', rowId).eq('client_id', clientId)
    if (error) return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })
    await recordClientActivity(supabase, {
      clientId,
      action: `meta_${kind}_deleted`,
      body: `Deleted Meta ${kind.replace('_', ' ')}`
    })
    return portalJson({ ok: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
