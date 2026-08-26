import 'server-only'

/**
 * Read-only Google Ads reporter → evidence events ads.spend_day / ads.lead.
 * Docs: https://developers.google.com/google-ads/api/docs/reporting/overview
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { appendEvidenceBatch } from '@/lib/events'
import { GoogleAdsApiClient } from '@/lib/google-attach/api'

export type GoogleAdsReportRow = {
  date: string
  spendAud: number
  clicks: number
  conversions: number
  campaignId?: string
  campaignName?: string
}

function ymdDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export async function fetchGoogleAdsPerformance(input: {
  refreshToken: string
  customerId: string
  campaignResource?: string
  days?: number
}): Promise<GoogleAdsReportRow[]> {
  const customerId = input.customerId.replace(/-/g, '')
  const api = new GoogleAdsApiClient({
    refreshToken: input.refreshToken,
    customerId,
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  })

  const since = ymdDaysAgo(input.days ?? 30)
  const campaignFilter = input.campaignResource
    ? `AND campaign.resource_name = '${input.campaignResource}'`
    : ''

  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.clicks,
      metrics.conversions
    FROM campaign
    WHERE segments.date >= '${since}'
      AND campaign.advertising_channel_type = 'SEARCH'
      ${campaignFilter}
    ORDER BY segments.date DESC
  `

  const rows = await api.searchStream<{
    segments?: { date?: string }
    campaign?: { id?: string; name?: string }
    metrics?: { costMicros?: string; clicks?: string; conversions?: number }
  }>(query)

  return rows.map((row) => ({
    date: String(row.segments?.date || ''),
    spendAud: Number(row.metrics?.costMicros || 0) / 1_000_000,
    clicks: Number(row.metrics?.clicks || 0),
    conversions: Number(row.metrics?.conversions || 0),
    campaignId: row.campaign?.id ? String(row.campaign.id) : undefined,
    campaignName: row.campaign?.name
  }))
}

export async function emitGoogleAdsReportEvents(
  supabase: SupabaseClient,
  input: {
    clientId: string
    customerId: string
    rows: GoogleAdsReportRow[]
  }
): Promise<{ emitted: number }> {
  const events = []
  for (const row of input.rows) {
    if (!row.date) continue
    events.push({
      client_id: input.clientId,
      source: 'google_attach',
      type: 'ads.spend_day',
      native_id: `${input.customerId}:${row.campaignId || 'all'}:${row.date}`,
      payload: {
        date: row.date,
        spend_aud: row.spendAud,
        clicks: row.clicks,
        conversions: row.conversions,
        campaign_id: row.campaignId ?? null,
        campaign_name: row.campaignName ?? null,
        customer_id: input.customerId
      }
    })
    if (row.conversions > 0) {
      events.push({
        client_id: input.clientId,
        source: 'google_attach',
        type: 'ads.lead',
        native_id: `${input.customerId}:${row.campaignId || 'all'}:${row.date}:leads`,
        payload: {
          date: row.date,
          conversions: row.conversions,
          campaign_id: row.campaignId ?? null,
          customer_id: input.customerId
        }
      })
    }
  }

  if (events.length === 0) return { emitted: 0 }
  await appendEvidenceBatch(supabase, events)
  return { emitted: events.length }
}

export async function reportGoogleAttachPerformance(
  supabase: SupabaseClient,
  input: {
    clientId: string
    refreshToken: string
    customerId: string
    campaignResource?: string
    days?: number
  }
): Promise<{ rows: GoogleAdsReportRow[]; emitted: number }> {
  const rows = await fetchGoogleAdsPerformance(input)
  const { emitted } = await emitGoogleAdsReportEvents(supabase, {
    clientId: input.clientId,
    customerId: input.customerId,
    rows
  })
  return { rows, emitted }
}
