import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { marketTestId } from '@/lib/offer-revisions'
import { portalJson, readBoundedJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }
const CLOSED = new Set(['won', 'lost', 'inconclusive', 'cancelled'])

async function loadLineage(offerId: string) {
  const admin = getPortalAdminClient()
  const offer = await admin
    .from('compass_outbound_offers')
    .select('id,offer_key,name,active_revision_id')
    .eq('id', offerId)
    .maybeSingle()
  if (offer.error) throw new Error(offer.error.message)
  if (!offer.data) return null
  const revisions = await admin
    .from('compass_offer_revisions')
    .select('*')
    .eq('offer_id', offerId)
    .order('version_no', { ascending: false })
  if (revisions.error) throw new Error(revisions.error.message)
  const revisionIds = (revisions.data ?? []).map((row) => String(row.id))
  const tests = revisionIds.length
    ? await admin
        .from('compass_market_tests')
        .select('*')
        .in('offer_revision_id', revisionIds)
        .order('created_at', { ascending: false })
    : { data: [], error: null }
  if (tests.error) throw new Error(tests.error.message)
  return { offer: offer.data, revisions: revisions.data ?? [], tests: tests.data ?? [] }
}

export async function GET(request: Request, context: Context) {
  const authError = requireAgentAuth(request)
  if (authError) return authError
  const { id } = await context.params
  try {
    const lineage = await loadLineage(id)
    if (!lineage) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({ ok: true, ...lineage })
  } catch (error) {
    return portalJson(
      { error: 'fetch_failed', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: Request, context: Context) {
  const authError = requireAgentAuth(request)
  if (authError) return authError
  const { id } = await context.params
  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }
  try {
    const lineage = await loadLineage(id)
    if (!lineage) return portalJson({ error: 'not_found' }, { status: 404 })
    const admin = getPortalAdminClient()
    if (body.action === 'create_market_test') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const hypothesis = typeof body.hypothesis === 'string' ? body.hypothesis.trim() : ''
      const vertical = typeof body.vertical === 'string' ? body.vertical.trim().toLowerCase() : ''
      const geography = typeof body.geography === 'string' ? body.geography.trim() : ''
      const channel = typeof body.channel === 'string' ? body.channel.trim().toLowerCase() : ''
      const revisionId = typeof body.offer_revision_id === 'string'
        ? body.offer_revision_id.trim()
        : String(lineage.offer.active_revision_id || '')
      const allowed = lineage.revisions.some((revision) => revision.id === revisionId)
      if (!name || !hypothesis || !vertical || !geography || !channel || !allowed) {
        return portalJson({ error: 'fields_or_revision_invalid' }, { status: 400 })
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
        sample_size_target: body.sample_size_target ?? null,
        budget_aud: body.budget_aud ?? null,
        stop_conditions: body.stop_conditions ?? {},
        created_by: 'agent-api',
        created_at: stamp,
        updated_at: stamp
      }
      const created = await admin.from('compass_market_tests').insert(row).select('*').single()
      if (created.error) throw new Error(created.error.message)
      return portalJson({ ok: true, test: created.data }, { status: 201 })
    }
    if (body.action === 'close_market_test') {
      const testId = typeof body.test_id === 'string' ? body.test_id.trim() : ''
      const status = typeof body.status === 'string' ? body.status.trim() : ''
      if (!testId || !CLOSED.has(status) || !body.closeout || typeof body.closeout !== 'object') {
        return portalJson({ error: 'closeout_required' }, { status: 400 })
      }
      const allowedRevisionIds = lineage.revisions.map((revision) => String(revision.id))
      const stamp = new Date().toISOString()
      const updated = await admin
        .from('compass_market_tests')
        .update({ status, closeout: body.closeout, closed_at: stamp, updated_at: stamp })
        .eq('id', testId)
        .in('offer_revision_id', allowedRevisionIds)
        .select('*')
        .maybeSingle()
      if (updated.error) throw new Error(updated.error.message)
      if (!updated.data) return portalJson({ error: 'not_found' }, { status: 404 })
      return portalJson({ ok: true, test: updated.data })
    }
    return portalJson({ error: 'unknown_action' }, { status: 400 })
  } catch (error) {
    return portalJson(
      { error: 'lineage_update_failed', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
