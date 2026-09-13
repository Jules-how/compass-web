import type { NextRequest } from 'next/server'

import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

const STATUSES = new Set(['planned', 'running', 'paused', 'won', 'lost', 'inconclusive', 'cancelled'])
type Context = { params: Promise<{ id: string; testId: string }> }

export async function PATCH(request: NextRequest, context: Context) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id, testId } = await context.params
  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }
  const status = typeof body.status === 'string' ? body.status.trim() : ''
  if (!STATUSES.has(status)) return portalJson({ error: 'status_invalid' }, { status: 400 })
  if (['won', 'lost', 'inconclusive', 'cancelled'].includes(status)) {
    if (!body.closeout || typeof body.closeout !== 'object' || Array.isArray(body.closeout)) {
      return portalJson({ error: 'closeout_required' }, { status: 400 })
    }
  }
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const revisionIds = await supabase.from('compass_offer_revisions').select('id').eq('offer_id', id)
    if (revisionIds.error) throw new Error(revisionIds.error.message)
    const allowed = (revisionIds.data ?? []).map((row) => String(row.id))
    if (!allowed.length) return portalJson({ error: 'not_found' }, { status: 404 })
    const stamp = new Date().toISOString()
    const patch = {
      status,
      updated_at: stamp,
      started_at: status === 'running' ? stamp : undefined,
      closed_at: ['won', 'lost', 'inconclusive', 'cancelled'].includes(status) ? stamp : null,
      closeout: body.closeout ?? null
    }
    const result = await supabase
      .from('compass_market_tests')
      .update(patch)
      .eq('id', testId)
      .in('offer_revision_id', allowed)
      .select('*')
      .maybeSingle()
    if (result.error) throw new Error(result.error.message)
    if (!result.data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({ test: result.data })
  } catch (error) {
    return portalAccessResponse(error) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}
