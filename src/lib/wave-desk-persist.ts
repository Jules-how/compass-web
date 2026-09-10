import type { SupabaseClient } from '@supabase/supabase-js'

import { mergeScanRecords } from '@/lib/home-setup'
import { sydneyDateOnly } from '@/lib/wave-desk'

export function mergeWaveBriefPayload(
  existing:
    | {
        recommendation?: string | null
        scan?: Record<string, unknown> | null
        created_at?: string | null
      }
    | null
    | undefined,
  incoming: { recommendation?: string | null; scan?: Record<string, unknown> | null }
): {
  recommendation: string | null
  scan: Record<string, unknown>
  created_at?: string
} {
  const recommendation = incoming.recommendation?.trim() || existing?.recommendation || null
  const scan = mergeScanRecords(existing?.scan, incoming.scan)
  return {
    recommendation,
    scan,
    ...(existing?.created_at ? { created_at: existing.created_at } : {})
  }
}

export async function persistDailyWaveScan(
  supabase: SupabaseClient,
  instantly?: {
    ok?: boolean
    emailsSentToday?: number
    repliesWaiting?: number
    replyRate?: number
    campaigns?: Array<{
      id: string
      name: string
      status: string
      sent?: number
      replies?: number
      replyRate?: number
    }>
  } | null
): Promise<void> {
  if (!instantly) return
  const day = sydneyDateOnly()
  const { error } = await supabase.rpc('compass_update_wave_metrics', {
    p_day: day,
    p_metrics: {
      emailsSentToday: instantly.emailsSentToday ?? 0,
      repliesWaiting: instantly.repliesWaiting ?? 0,
      replyRate: instantly.replyRate ?? 0,
      campaigns: (instantly.campaigns ?? []).slice(0, 20)
    }
  })
  if (error) throw new Error(error.message)
}
