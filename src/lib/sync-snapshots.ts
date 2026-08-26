import type { SupabaseClient } from '@supabase/supabase-js'

export type SyncSnapshotId =
  | 'instantly_cold_email'
  | 'daily_brief'
  | 'last_daily_sync'
  | 'daily_decision_digest'
  | 'evidence_poller_watermark'
  | 'instantly_backfill'

export async function upsertSyncSnapshot(
  supabase: SupabaseClient,
  id: SyncSnapshotId,
  payload: unknown,
  source = 'live'
): Promise<void> {
  const { error } = await supabase.from('compass_sync_snapshots').upsert({
    id,
    payload,
    source,
    synced_at: new Date().toISOString()
  })
  if (error) throw new Error(error.message)
}

export async function loadSyncSnapshot<T>(
  supabase: SupabaseClient,
  id: SyncSnapshotId
): Promise<{ payload: T; source: string; syncedAt: string } | null> {
  const { data, error } = await supabase
    .from('compass_sync_snapshots')
    .select('payload,source,synced_at')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data?.payload || typeof data.payload !== 'object') return null

  return {
    payload: data.payload as T,
    source: String(data.source ?? 'live'),
    syncedAt: String(data.synced_at ?? '')
  }
}
