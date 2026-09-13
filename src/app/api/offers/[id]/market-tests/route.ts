import type { NextRequest } from 'next/server'

import { marketTestId } from '@/lib/offer-revisions'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

async function offerAndRevisionIds(
  supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase'],
  offerId: string
) {
  const offer = await supabase
    .from('compass_outbound_offers')
    .select('id,active_revision_id')
    .eq('id', offerId)
    .maybeSingle()
  if (offer.error) throw new Error(offer.error.message)
  if (!offer.data) throw new Error('offer_not_found')
  const revisions = await supabase
    .from('compass_offer_revisions')
    .select('id')
    .eq('offer_id', offerId)
  if (revisions.error) throw new Error(revisions.error.message)
  return {
    activeRevisionId: offer.data.active_revision_id as string | null,
    revisionIds: (revisions.data ?? []).map((row) => String(row.id))
  }
}

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const lineage = await offerAndRevisionIds(supabase, id)
    if (!lineage.revisionIds.length) return portalJson({ tests: [] })
    const result = await supabase
      .from('compass_market_tests')
      .select('*')
      .in('offer_revision_id', lineage.revisionIds)
      .order('created_at', { ascending: false })
    if (result.error) throw new Error(result.error.message)
    return portalJson({ tests: result.data ?? [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'offer_not_found') return portalJson({ error: 'not_found' }, { status: 404 })
    return portalAccessResponse(error) ?? portalJson({ error: 'fetch_failed', detail: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: Context) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const hypothesis = typeof body.hypothesis === 'string' ? body.hypothesis.trim() : ''
  const vertical = typeof body.vertical === 'string' ? body.vertical.trim().toLowerCase() : ''
  const geography = typeof body.geography === 'string' ? body.geography.trim() : ''
  const channel = typeof body.channel === 'string' ? body.channel.trim().toLowerCase() : ''
  if (!name || !hypothesis || !vertical || !geography || !channel) {
    return portalJson({ error: 'fields_required' }, { status: 400 })
  }
  const sample = body.sample_size_target == null || body.sample_size_target === ''
    ? null
    : Number(body.sample_size_target)
  const budget = body.budget_aud == null || body.budget_aud === '' ? null : Number(body.budget_aud)
  if ((sample != null && (!Number.isInteger(sample) || sample < 1)) || (budget != null && (!Number.isFinite(budget) || budget < 0))) {
    return portalJson({ error: 'bounds_invalid' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const lineage = await offerAndRevisionIds(supabase, id)
    const revisionId =
      typeof body.offer_revision_id === 'string' && body.offer_revision_id.trim()
        ? body.offer_revision_id.trim()
        : lineage.activeRevisionId
    if (!revisionId || !lineage.revisionIds.includes(revisionId)) {
      return portalJson({ error: 'offer_revision_invalid' }, { status: 400 })
    }
    const stamp = new Date().toISOString()
    const row = {
      id: marketTestId(revisionId, name),
      offer_revision_id: revisionId,
      name,
      hypothesis,
      vertical,
      geography,
      channel,
      status: 'planned',
      sample_size_target: sample,
      budget_aud: budget,
      stop_conditions:
        body.stop_conditions && typeof body.stop_conditions === 'object' && !Array.isArray(body.stop_conditions)
          ? body.stop_conditions
          : {},
      created_by: 'operator-ui',
      created_at: stamp,
      updated_at: stamp
    }
    const result = await supabase.from('compass_market_tests').insert(row).select('*').single()
    if (result.error) throw new Error(result.error.message)
    return portalJson({ test: result.data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'offer_not_found') return portalJson({ error: 'not_found' }, { status: 404 })
    return portalAccessResponse(error) ?? portalJson({ error: 'create_failed', detail: message }, { status: 500 })
  }
}
