import type { SupabaseClient } from '@supabase/supabase-js'

import { appendEvidenceBatch } from '@/lib/events'
import { evidenceEventsForResult } from './engine.mjs'
import type { CsArtifact, CsArtifactStatus, CsBoard, CsCard } from './types'

function tablesMissing(message: string): boolean {
  const msg = message.toLowerCase()
  return msg.includes('does not exist') || msg.includes('could not find the table') || msg.includes('schema cache')
}

export async function persistBoard(
  supabase: SupabaseClient,
  board: CsBoard,
  now = new Date()
): Promise<void> {
  if (board.snapshots.length > 0) {
    const { error } = await supabase.from('compass_cs_snapshots').upsert(
      board.snapshots.map((row) => ({
        id: row.id,
        client_id: row.client_id,
        scored_at: row.scored_at,
        period_end: row.period_end,
        score: row.score,
        band: row.band,
        at_risk: row.at_risk,
        prior_score: row.prior_score,
        drop_points: row.drop_points,
        factors: row.factors,
        is_demo: row.is_demo
      })),
      { onConflict: 'id' }
    )
    if (error) throw new Error(error.message)
  }

  if (board.artifacts.length > 0) {
    const { error } = await supabase.from('compass_cs_artifacts').upsert(
      board.artifacts.map((row) => ({
        id: row.id,
        client_id: row.client_id,
        client_name: row.client_name,
        kind: row.kind,
        period_start: row.period_start,
        period_end: row.period_end,
        status: row.status,
        title: row.title,
        body: row.body,
        payload: row.payload,
        is_demo: row.is_demo,
        created_at: row.created_at,
        updated_at: now.toISOString()
      })),
      { onConflict: 'id', ignoreDuplicates: true }
    )
    if (error) throw new Error(error.message)
  }

  const events = board.cards.flatMap((card) => evidenceEventsForResult(card, now))
  if (events.length > 0) {
    await appendEvidenceBatch(supabase, events)
  }
}

export async function loadBoard(supabase: SupabaseClient): Promise<CsBoard | null> {
  const [snapRes, artRes] = await Promise.all([
    supabase.from('compass_cs_snapshots').select('*').order('scored_at', { ascending: false }),
    supabase.from('compass_cs_artifacts').select('*').order('created_at', { ascending: false })
  ])
  if (snapRes.error) {
    if (tablesMissing(snapRes.error.message)) return null
    throw new Error(snapRes.error.message)
  }
  if (artRes.error) {
    if (tablesMissing(artRes.error.message)) return null
    throw new Error(artRes.error.message)
  }

  const snapshots = snapRes.data ?? []
  const artifacts = (artRes.data ?? []) as CsArtifact[]
  if (snapshots.length === 0 && artifacts.length === 0) return null

  const latestByClient = new Map<string, (typeof snapshots)[number]>()
  for (const row of snapshots) {
    if (!latestByClient.has(row.client_id)) latestByClient.set(row.client_id, row)
  }

  const period = [...latestByClient.values()][0]?.period_end ?? null
  const periodArtifacts = period
    ? artifacts.filter((row) => row.period_end === period)
    : artifacts

  const cards: CsCard[] = [...latestByClient.values()].map((snap) => {
    const clientArts = periodArtifacts.filter((row) => row.client_id === snap.client_id)
    const name = clientArts[0]?.client_name || snap.client_id
    const guarantee = clientArts.find((row) => row.kind === 'guarantee')
    const attention = snap.at_risk
      ? 'at_risk'
      : guarantee && guarantee.payload?.made_fees_back === false
        ? 'guarantee_short'
        : guarantee
          ? 'guarantee'
          : clientArts.some((row) => row.kind === 'qbr')
            ? 'qbr'
            : 'healthy'
    return {
      client: {
        id: snap.client_id,
        name,
        city: null,
        trade: null,
        owner_name: null,
        owner_mobile: null,
        is_demo: Boolean(snap.is_demo)
      },
      snapshot: snap,
      artifacts: clientArts,
      checkpoint: (guarantee?.payload as CsCard['checkpoint']) || {
        due: false,
        day_index: null,
        fees_paid: 1997,
        recovered: 0,
        made_fees_back: null
      },
      attention
    }
  })

  const { assembleBoard } = await import('./engine.mjs')
  return assembleBoard(cards, new Date()) as CsBoard
}

export async function patchArtifact(
  supabase: SupabaseClient,
  id: string,
  patch: { status?: CsArtifactStatus; body?: string }
): Promise<CsArtifact> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.status) update.status = patch.status
  if (typeof patch.body === 'string') update.body = patch.body
  const { data, error } = await supabase
    .from('compass_cs_artifacts')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) {
    if (tablesMissing(error.message)) {
      throw new Error('cs_tables_missing')
    }
    throw new Error(error.message)
  }
  if (!data) throw new Error('not_found')
  return data as CsArtifact
}
