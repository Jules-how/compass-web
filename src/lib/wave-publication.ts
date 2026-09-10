import type { SupabaseClient } from '@supabase/supabase-js'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { openCommercial } from '@/lib/agreement-server'
import type { PlanningRow } from '@/lib/planning-server'

export const WAVE_DECISION_ID = 'planning.note.458e8ef0-80cc-5405-aa5c-eb804faf70b0'
export const WAVE_PUBLISHER = 'compass-morning-pilot'

export async function readWaveDecision(db: SupabaseClient = getPortalAdminClient()) {
  const { data, error } = await db.from('compass_settings')
    .select('value').eq('id', WAVE_DECISION_ID).maybeSingle()
  if (error || !data) throw new Error('Current decisions are unavailable. Try again after restoring access.')
  const value = String(data.value)
  const record = openCommercial<PlanningRow>(value)
  if (record.data.archived) throw new Error('Current decision note is archived.')
  return { value, revision: record.revision }
}

export function waveReviewState(row: {
  reviewed_at?: string | null; decision_revision?: number | null; publisher?: string | null;
  recommendation?: string | null; id?: string
} | null, day: string, decisionRevision: number): 'current' | 'stale' | 'unreviewed' | 'missing' {
  if (!row?.recommendation) return 'missing'
  if (!row.reviewed_at || !row.publisher || !row.decision_revision) return 'unreviewed'
  return row.id === day && row.decision_revision === decisionRevision ? 'current' : 'stale'
}
