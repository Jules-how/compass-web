import type { SupabaseClient } from '@supabase/supabase-js'

import { sydneyDateOnly } from '@/lib/wave-desk'

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
  const { data: existing } = await supabase
    .from('compass_wave_briefs')
    .select('recommendation')
    .eq('id', day)
    .maybeSingle()
  const { error } = await supabase.from('compass_wave_briefs').upsert({
    id: day,
    generated_at: new Date().toISOString(),
    recommendation: existing?.recommendation ?? null,
    scan: {
      emailsSentToday: instantly.emailsSentToday ?? 0,
      repliesWaiting: instantly.repliesWaiting ?? 0,
      replyRate: instantly.replyRate ?? 0,
      campaigns: (instantly.campaigns ?? []).slice(0, 20)
    }
  })
  if (error) throw new Error(error.message)
}
