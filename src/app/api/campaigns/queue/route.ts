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
  parseGoLiveAt
} from '@/lib/campaigns'
import {
  RECONTACT_PROMOTE_MIN,
  QUEUE_WAVE_SIZE,
  buildRunway,
  groupRecontactPool,
  queueWeekBucket,
  freshCampaignName,
  recontactCampaignName,
  type QueueCampaign,
  type QueuePayload
} from '@/lib/campaign-queue'
import { insertPipelineCampaign, listPipelineCampaigns } from '@/lib/campaigns-server'
import { applyRecontactReadyFilters } from '@/lib/leads-query'

export const dynamic = 'force-dynamic'

const QUEUE_STATUSES = ['draft', 'planned', 'paused']

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const today = dateOnlyInZone(new Date().toISOString())

    const allCampaigns = await listPipelineCampaigns(supabase)
    const queueCampaigns = allCampaigns.filter((c) => QUEUE_STATUSES.includes(String(c.status)))

    const sendableQuery = supabase
      .from('lead_contacts')
      .select('vertical')
      .is('suppression_reason', null)
      .neq('outbound_status', 'suppressed')
      .is('last_outbound_at', null)
      .not('email', 'is', null)
      .neq('email', '')
      .limit(5000)

    const readyQuery = applyRecontactReadyFilters(
      supabase.from('lead_contacts').select('vertical,city').limit(5000) as never
    ) as Promise<{ data: Array<{ vertical: string | null; city: string | null }> | null }>

    const [sendableRes, readyRes] = await Promise.all([sendableQuery, readyQuery])

    const queue: QueueCampaign[] = queueCampaigns.map((row) => ({
      id: row.id,
      name: row.name,
      status: String(row.status),
      start_date: row.start_date ?? null,
      priority: typeof row.priority === 'number' ? row.priority : 0,
      vertical_tags: Array.isArray(row.vertical_tags) ? row.vertical_tags : [],
      location_tags: Array.isArray(row.location_tags) ? row.location_tags : [],
      copy_status: String(row.copy_status || 'none'),
      bound: Boolean((row.instantly_campaign_id || '').trim()),
      cohort: row.wave_cohort_count ?? 0,
      week: queueWeekBucket(row.start_date, today)
    }))

    const sendable = (sendableRes.data ?? []) as Array<{ vertical: string | null }>
    const ready = (readyRes.data ?? []) as Array<{ vertical: string | null; city: string | null }>

    const payload: QueuePayload = {
      queue,
      runway: buildRunway(sendable, ready),
      recontactPool: groupRecontactPool(ready),
      promoteMin: RECONTACT_PROMOTE_MIN,
      waveSize: QUEUE_WAVE_SIZE,
      generatedAt: new Date().toISOString()
    }
    return portalJsonCached(payload, {}, 5)
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    const message = err instanceof Error ? err.message : 'fetch_failed'
    return portalJson({ error: 'fetch_failed', detail: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: {
    action?: 'promote' | 'schedule'
    vertical?: string
    city?: string | null
    start_date?: string
    go_live_at?: string | null
    name?: string
  }
  try {
    body = (await readBoundedJson(request, 64 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const action = body.action
  if (action !== 'promote' && action !== 'schedule') {
    return portalJson({ error: 'invalid_action' }, { status: 400 })
  }

  const vertical = (body.vertical || '').trim()
  if (!vertical) return portalJson({ error: 'vertical_required' }, { status: 400 })

  const startDate = (body.start_date || '').trim()
  const parsedGoLiveRes = parseGoLiveAt(
    body.go_live_at === undefined
      ? startDate
        ? `${startDate}T08:00:00+10:00`
        : defaultGoLiveAt()
      : body.go_live_at
  )
  const parsedGoLive = parsedGoLiveRes.ok ? parsedGoLiveRes.iso : null
  const effectiveStartDate = startDate || (parsedGoLive ? dateOnlyInZone(parsedGoLive) : null)
  if (!effectiveStartDate) return portalJson({ error: 'start_date_required' }, { status: 400 })

  const city = (body.city || '').trim() || null
  const campaignName =
    body.name?.trim() ||
    (action === 'promote'
      ? recontactCampaignName(vertical, city, effectiveStartDate)
      : freshCampaignName(vertical, city, effectiveStartDate))

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const created = await insertPipelineCampaign(supabase, {
      name: campaignName,
      status: 'planned',
      priority: 2,
      health: 'no_updates',
      start_date: effectiveStartDate,
      go_live_at: parsedGoLive,
      color: '#ea580c',
      vertical_tags: [vertical],
      location_tags: city ? [city] : [],
      copy_status: 'draft',
      wave_lane: 'next'
    })
    return portalJson({ campaign: created }, { status: 201 })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    const message = err instanceof Error ? err.message : 'queue_mutation_failed'
    return portalJson({ error: 'queue_mutation_failed', detail: message }, { status: 500 })
  }
}
