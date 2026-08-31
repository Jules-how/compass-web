import type { NextRequest } from 'next/server'
import {
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
import {
  getLocalDb,
  getPipelineCampaigns,
  upsertPipelineCampaign,
  addPipelineActivity
} from '@/lib/local-db'
import { recontactCutoffIso } from '@/lib/recontact-eligibility'

export const dynamic = 'force-dynamic'

const QUEUE_STATUSES = ['draft', 'planned', 'paused']

export async function GET() {
  try {
    const db = getLocalDb()
    const today = dateOnlyInZone(new Date().toISOString())
    const cutoff = recontactCutoffIso()

    const allCampaigns = getPipelineCampaigns()
    const queueCampaigns = allCampaigns.filter((c) => QUEUE_STATUSES.includes(c.status))

    const leads = db.prepare(`
      SELECT pipeline_campaign_id, outbound_status, opener
      FROM lead_contacts
      WHERE pipeline_campaign_id IS NOT NULL
    `).all() as Array<{ pipeline_campaign_id: string; outbound_status: string; opener: string | null }>

    const tallies = tallyLeadsByCampaign(leads)

    const sendable = db.prepare(`
      SELECT vertical FROM lead_contacts
      WHERE suppression_reason IS NULL
        AND outbound_status != 'suppressed'
        AND last_outbound_at IS NULL
        AND email IS NOT NULL
        AND email != ''
    `).all() as Array<{ vertical: string | null }>

    const ready = db.prepare(`
      SELECT vertical, city FROM lead_contacts
      WHERE outbound_status != 'suppressed'
        AND suppression_reason IS NULL
        AND (recontact_ok = 1 OR recontact_ok IS NULL)
        AND last_outbound_at IS NOT NULL
        AND last_outbound_at < ?
        AND outbound_status NOT IN ('replied', 'interested', 'booked', 'meeting_booked', 'converted')
    `).all(cutoff) as Array<{ vertical: string | null; city: string | null }>

    const queue: QueueCampaign[] = queueCampaigns.map((row) => ({
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
    return portalJsonCached(payload, {}, 5)
  } catch (err) {
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

  const now = new Date().toISOString()
  const campaignId = `campaign-${crypto.randomUUID()}`

  try {
    const db = getLocalDb()

    const created = upsertPipelineCampaign({
      id: campaignId,
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
      created_at: now,
      updated_at: now
    })

    addPipelineActivity(campaignId, 'queue_promote', `Created wave slot "${campaignName}"`, {
      action,
      vertical,
      city,
      startDate: effectiveStartDate
    })

    return portalJson({ campaign: created }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'queue_mutation_failed'
    return portalJson({ error: 'queue_mutation_failed', detail: message }, { status: 500 })
  }
}
