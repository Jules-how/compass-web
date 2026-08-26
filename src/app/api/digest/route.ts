import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached, readBoundedJson, requireSameOrigin } from '@/lib/portal-http'
import { stringifyExecutionContract } from '@/lib/execution-contract'
import {
  generateDailyDigest,
  loadDailyDigest,
  undoDigestCompletion
} from '@/lib/evidence-poller'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    let digest = await loadDailyDigest(supabase)
    if (!digest) digest = await generateDailyDigest(supabase)
    return portalJsonCached({ digest })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: { task_id?: string; action?: string; proposed_key?: string }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const action = body.action?.trim()
  if (!action) return portalJson({ error: 'action_required' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    if (action === 'undo') {
      if (!body.task_id) return portalJson({ error: 'task_id_required' }, { status: 400 })
      const result = await undoDigestCompletion(supabase, body.task_id)
      if (!result.ok) return portalJson({ error: result.error ?? 'undo_failed' }, { status: 400 })
      const digest = await loadDailyDigest(supabase)
      return portalJson({ ok: true, digest })
    }

    if (action === 'accept_proposed') {
      if (!body.proposed_key) return portalJson({ error: 'proposed_key_required' }, { status: 400 })
      const digest = await loadDailyDigest(supabase)
      const item = digest?.proposed.find((p) => p.key === body.proposed_key)
      if (!item) return portalJson({ error: 'proposed_not_found' }, { status: 404 })
      const stamp = new Date().toISOString()
      const contract = {
        fingerprint: item.fingerprint || item.key,
        ...(item.proof?.length
          ? { proof: [{ all: item.proof.map((clause) => ({ ...clause, min_count: clause.min_count ?? 1 })) }] }
          : {})
      }
      const { error } = await supabase.from('compass_tasks').insert({
        id: `task-${crypto.randomUUID()}`,
        title: item.title,
        status: 'not-started',
        priority: 2,
        due: item.due,
        notes: item.reason,
        source: 'digest_proposed',
        execution_contract: stringifyExecutionContract(contract),
        created_at: stamp,
        updated_at: stamp,
        mirrored_at: stamp
      })
      if (error) return portalJson({ error: error.message }, { status: 400 })
      const nextDigest = digest
        ? {
            ...digest,
            proposed: digest.proposed.filter((p) => p.key !== body.proposed_key)
          }
        : null
      if (nextDigest) {
        const { upsertSyncSnapshot } = await import('@/lib/sync-snapshots')
        await upsertSyncSnapshot(supabase, 'daily_decision_digest', nextDigest, 'live')
      }
      return portalJson({ ok: true, digest: nextDigest })
    }

    if (action === 'reject_proposed') {
      if (!body.proposed_key) return portalJson({ error: 'proposed_key_required' }, { status: 400 })
      const digest = await loadDailyDigest(supabase)
      if (!digest) return portalJson({ error: 'digest_missing' }, { status: 404 })
      const nextDigest = {
        ...digest,
        proposed: digest.proposed.filter((p) => p.key !== body.proposed_key)
      }
      const { upsertSyncSnapshot } = await import('@/lib/sync-snapshots')
      await upsertSyncSnapshot(supabase, 'daily_decision_digest', nextDigest, 'live')
      return portalJson({ ok: true, digest: nextDigest })
    }

    return portalJson({ error: 'unknown_action' }, { status: 400 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'action_failed' }, { status: 500 })
  }
}
