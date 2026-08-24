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
  dateOnlyInZone,
  defaultGoLiveAt,
  emptyCampaignCopyFields,
  parseGoLiveAt,
  type CompassCampaign
} from '@/lib/campaigns'
import { tallyLeadsByCampaign } from '@/lib/campaign-wave'
import { applyRecontactReadyFilters } from '@/lib/leads-query'
import {
  RECONTACT_PROMOTE_MIN,
  QUEUE_WAVE_SIZE,
  buildRunway,
  groupRecontactPool,
  mondayWeeksAhead,
  queueWeekBucket,
  freshCampaignName,
  recontactCampaignName,
  type QueueCampaign,
  type QueuePayload
} from '@/lib/campaign-queue'
import { syncCampaignToGoogleCalendarQuiet } from '@/lib/campaign-google-calendar'

export const dynamic = 'force-dynamic'

const QUEUE_CAMPAIGN_COLUMNS =
  'id,name,status,start_date,priority,vertical_tags,location_tags,copy_status,instantly_campaign_id'

const QUEUE_STATUSES = ['draft', 'planned', 'paused'] as const

/** Loose builder: LeadFilterQuery-compatible chain that still awaits like supabase-js. */
type LeadRowsQuery = {
  eq: (column: string, value: unknown) => LeadRowsQuery
  in: (column: string, values: readonly string[]) => LeadRowsQuery
  ilike: (column: string, pattern: string) => LeadRowsQuery
  or: (filters: string) => LeadRowsQuery
  is: (column: string, value: null) => LeadRowsQuery
  not: (column: string, operator: string, value: unknown) => LeadRowsQuery
  neq: (column: string, value: unknown) => LeadRowsQuery
  lt: (column: string, value: unknown) => LeadRowsQuery
  gte: (column: string, value: unknown) => LeadRowsQuery
  limit: (
    n: number
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
}

function leadRowsQuery(
  supabase: { from: (table: string) => unknown },
  columns: string
): LeadRowsQuery {
  return (supabase.from('lead_contacts') as {
    select: (columns: string) => LeadRowsQuery
  }).select(columns)
}

// GET /api/campaigns/queue — week-level planning view: unpushed campaigns
// bucketed by week, per-vertical runway, and the 90-day recontact pool.
export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const today = dateOnlyInZone(new Date().toISOString())

    const readyQuery = applyRecontactReadyFilters(
      leadRowsQuery(supabase, 'vertical,city')
    ) as LeadRowsQuery

    const [campaignRes, talliesRes, sendableRes, readyRes] = await Promise.all([
      supabase
        .from('compass_pipeline_campaigns')
        .select(QUEUE_CAMPAIGN_COLUMNS)
        .in('status', [...QUEUE_STATUSES])
        .order('start_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: false })
        .order('name'),
      supabase
        .from('lead_contacts')
        .select('pipeline_campaign_id,outbound_status,opener')
        .not('pipeline_campaign_id', 'is', null)
        .limit(8000),
      supabase
        .from('lead_contacts')
        .select('vertical')
        .is('suppression_reason', null)
        .neq('outbound_status', 'suppressed')
        .is('last_outbound_at', null)
        .not('email', 'is', null)
        .neq('email', '')
        .limit(8000),
      readyQuery.limit(8000)
    ])

    if (campaignRes.error) {
      return portalJson(
        { error: 'fetch_failed', detail: campaignRes.error.message },
        { status: 500 }
      )
    }

    const tallies = talliesRes.error ? {} : tallyLeadsByCampaign(talliesRes.data ?? [])
    const sendable = sendableRes.error ? [] : ((sendableRes.data ?? []) as Array<{ vertical: string | null }>)
    const ready = readyRes.error
      ? []
      : ((readyRes.data ?? []) as Array<{ vertical: string | null; city: string | null }>)

    const queue: QueueCampaign[] = ((campaignRes.data ?? []) as CompassCampaign[]).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      start_date: row.start_date ?? null,
      priority: typeof row.priority === 'number' ? row.priority : 0,
      vertical_tags: Array.isArray(row.vertical_tags) ? row.vertical_tags : [],
      location_tags: Array.isArray(row.location_tags) ? row.location_tags : [],
      copy_status: row.copy_status || 'none',
      bound: Boolean((row.instantly_campaign_id || '').trim()),
      cohort: tallies[row.id]?.cohort ?? 0,
      week: queueWeekBucket(row.start_date, today)
    }))

    const payload: QueuePayload = {
      queue,
      runway: buildRunway(sendable, ready),
      recontactPool: groupRecontactPool(ready),
      promoteMin: RECONTACT_PROMOTE_MIN,
      waveSize: QUEUE_WAVE_SIZE,
      generatedAt: new Date().toISOString()
    }
    return portalJsonCached(payload, {}, 30)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

// POST /api/campaigns/queue — date a recontact cohort (`promote`) or a fresh
// vertical slot (`schedule`) onto the calendar. Copy + Instantly push stay in
// the campaign workspace. Activate stays in Instantly.
export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: {
    action?: string
    vertical?: string
    city?: string | null
    go_live_at?: string | null
  }
  try {
    body = (await readBoundedJson(request, 64 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  if (body.action !== 'promote' && body.action !== 'schedule') {
    return portalJson({ error: 'invalid_action' }, { status: 400 })
  }
  const vertical = body.vertical?.trim().toLowerCase()
  if (!vertical) return portalJson({ error: 'vertical_required' }, { status: 400 })
  const city = typeof body.city === 'string' ? body.city.trim() : ''
  const parsedGoLive = parseGoLiveAt(
    body.go_live_at === undefined ? defaultGoLiveAt() : body.go_live_at
  )
  if (!parsedGoLive.ok) return portalJson({ error: 'invalid_go_live_at' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const stamp = new Date().toISOString()
    const today = dateOnlyInZone(stamp)
    const goLiveAt = parsedGoLive.iso || defaultGoLiveAt()
    const dated = Boolean(body.go_live_at)
    const startDate = dated ? dateOnlyInZone(goLiveAt) : mondayWeeksAhead(today, 1)

    if (body.action === 'schedule') {
      const row = {
        id: `campaign-${crypto.randomUUID()}`,
        name: freshCampaignName(vertical, city || null, today),
        status: 'planned',
        priority: 0,
        health: 'no_updates',
        start_date: startDate,
        end_date: startDate,
        go_live_at: goLiveAt,
        color: '#94a3b8',
        summary: `Fresh wave: ${vertical}${city ? ` · ${city}` : ''}. Attach sendable leads in the campaign workspace.`,
        labels: [],
        owner_label: null,
        ...emptyCampaignCopyFields(),
        instantly_campaign_id: null,
        vertical_tags: [vertical],
        location_tags: city ? [city.toLowerCase()] : [],
        created_at: stamp,
        updated_at: stamp
      }

      const { data, error } = await supabase
        .from('compass_pipeline_campaigns')
        .insert(row)
        .select(QUEUE_CAMPAIGN_COLUMNS)
        .single()
      if (error) {
        return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
      }

      await supabase.from('compass_pipeline_activity').insert({
        id: `cact-${crypto.randomUUID()}`,
        campaign_id: row.id,
        actor: 'operator',
        action: 'created',
        body: `Scheduled ${vertical} wave`,
        created_at: stamp
      })

      await syncCampaignToGoogleCalendarQuiet(supabase, { ...row, ...data } as CompassCampaign)
      return portalJson({ ok: true, campaign: data, assigned: 0, requested: 0 }, { status: 201 })
    }

    let readyQuery = (applyRecontactReadyFilters(
      leadRowsQuery(supabase, 'id')
    ) as LeadRowsQuery).ilike('vertical', vertical)
    if (city) readyQuery = readyQuery.ilike('city', city)

    const readyRes = await readyQuery.limit(500)
    if (readyRes.error) {
      return portalJson({ error: 'fetch_failed', detail: readyRes.error.message }, { status: 500 })
    }
    const ids = ((readyRes.data ?? []) as Array<{ id: string }>).map((r) => r.id)
    if (ids.length < RECONTACT_PROMOTE_MIN) {
      return portalJson(
        {
          error: 'thin_cohort',
          detail: `${ids.length} ready leads — minimum ${RECONTACT_PROMOTE_MIN} for a campaign slot`
        },
        { status: 400 }
      )
    }

    const row = {
      id: `campaign-${crypto.randomUUID()}`,
      name: recontactCampaignName(vertical, city || null, today),
      status: 'planned',
      priority: 0,
      health: 'no_updates',
      start_date: startDate,
      end_date: startDate,
      go_live_at: goLiveAt,
      color: '#94a3b8',
      summary: `Recontact wave: ${ids.length} leads past the 90-day cooldown.`,
      labels: ['recontact'],
      owner_label: null,
      ...emptyCampaignCopyFields(),
      instantly_campaign_id: null,
      vertical_tags: [vertical],
      location_tags: city ? [city.toLowerCase()] : [],
      created_at: stamp,
      updated_at: stamp
    }

    const { data, error } = await supabase
      .from('compass_pipeline_campaigns')
      .insert(row)
      .select(QUEUE_CAMPAIGN_COLUMNS)
      .single()
    if (error) {
      return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
    }

    let assigned = 0
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { error: assignError } = await supabase
        .from('lead_contacts')
        .update({ pipeline_campaign_id: row.id, updated_at: stamp, mirrored_at: stamp })
        .in('id', chunk)
      if (!assignError) assigned += chunk.length
    }

    await supabase.from('compass_pipeline_activity').insert({
      id: `cact-${crypto.randomUUID()}`,
      campaign_id: row.id,
      actor: 'operator',
      action: 'created',
      body: `Promoted recontact cohort (${assigned} leads past 90-day cooldown)`,
      created_at: stamp
    })

    await syncCampaignToGoogleCalendarQuiet(supabase, { ...row, ...data } as CompassCampaign)

    return portalJson(
      { ok: true, campaign: data, assigned, requested: ids.length },
      { status: 201 }
    )
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'promote_failed' }, { status: 500 })
  }
}
