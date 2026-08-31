import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { appendEvidenceBatch } from '@/lib/events'
import { resolveMetaAttachDriver } from '@/lib/meta-attach/graph'
import type { MetaAttachRow } from '@/lib/meta-attach/types'

export async function reportMetaAttachInsights(
  supabase: SupabaseClient,
  rows: MetaAttachRow[]
): Promise<{ reported: number; skipped: number; error?: string }> {
  const driver = resolveMetaAttachDriver()
  if (!driver.ok || !driver.adapter.fetchAdInsights) {
    return { reported: 0, skipped: rows.length, error: driver.ok ? undefined : driver.error }
  }

  const events: Array<{
    client_id: string
    source: string
    type: string
    vertical: string | null
    offer: string | null
    product: string
    native_id: string
    payload: Record<string, unknown>
  }> = []

  let reported = 0
  let skipped = 0

  for (const row of rows) {
    const adIds = row.meta_ids?.ad_ids ?? []
    const adAccountId = row.review?.meta_ad_account_id
    if (row.status !== 'created_paused' && row.status !== 'live') {
      skipped += 1
      continue
    }
    if (adIds.length === 0 || !adAccountId) {
      skipped += 1
      continue
    }

    try {
      const insights = await driver.adapter.fetchAdInsights({
        adAccountId,
        adIds,
        datePreset: 'yesterday'
      })

      const vertical = String(row.creative_brief?.messaging ?? row.offer_cell)
      for (const insight of insights) {
        const day = insight.date_start ?? new Date().toISOString().slice(0, 10)
        if (insight.spend > 0) {
          events.push({
            client_id: row.client_id,
            source: 'meta_attach',
            type: 'ads.spend_day',
            vertical: vertical,
            offer: row.offer_cell,
            product: 'meta_attach',
            native_id: `spend-${insight.ad_id}-${day}`,
            payload: {
              ad_id: insight.ad_id,
              attach_id: row.id,
              spend: insight.spend,
              day
            }
          })
        }
        if (insight.leads > 0) {
          events.push({
            client_id: row.client_id,
            source: 'meta_attach',
            type: 'ads.lead',
            vertical: vertical,
            offer: row.offer_cell,
            product: 'meta_attach',
            native_id: `lead-${insight.ad_id}-${day}`,
            payload: {
              ad_id: insight.ad_id,
              attach_id: row.id,
              leads: insight.leads,
              day
            }
          })
        }
      }
      reported += 1
    } catch {
      skipped += 1
    }
  }

  if (events.length > 0) {
    await appendEvidenceBatch(supabase, events)
  }

  return { reported, skipped }
}
