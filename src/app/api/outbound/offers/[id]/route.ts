import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { archiveLibraryItem, getLibraryItem, outboundNowIso, tagsFromBody } from '@/lib/outbound-api'
import { applyOfferSkuFields } from '@/lib/offer-sku'
import { hasOfferContentPatch, reviseOffer } from '@/lib/offer-revisions'

export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: Ctx) {
  const { id } = await context.params
  return getLibraryItem('compass_outbound_offers', id)
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }
  const stamp = outboundNowIso()
  const buildPatch = () => {
    const patch: Record<string, unknown> = { updated_at: stamp }
    if (typeof body.offer_key === 'string') patch.offer_key = body.offer_key.trim()
    if (typeof body.name === 'string') patch.name = body.name.trim()
    if (typeof body.pack_summary === 'string') patch.pack_summary = body.pack_summary.trim()
    if (body.positioning_line !== undefined) {
      patch.positioning_line =
        typeof body.positioning_line === 'string' ? body.positioning_line.trim() || null : null
    }
    if (body.vertical_tags !== undefined) patch.vertical_tags = tagsFromBody(body.vertical_tags)
    if (body.location_tags !== undefined) patch.location_tags = tagsFromBody(body.location_tags)
    if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order
    if (typeof body.archived === 'boolean') patch.archived = body.archived
    const sku = applyOfferSkuFields(body, patch)
    if (!sku.ok) return { error: sku.error }
    return patch
  }
  const patch = buildPatch()
  if ('error' in patch) return portalJson({ error: patch.error }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const existing = await supabase
      .from('compass_outbound_offers')
      .select('id,active_revision_id')
      .eq('id', id)
      .maybeSingle()
    if (existing.error) {
      return portalJson({ error: 'fetch_failed', detail: existing.error.message }, { status: 500 })
    }
    if (!existing.data) return portalJson({ error: 'not_found' }, { status: 404 })

    if (hasOfferContentPatch(patch)) {
      const data = await reviseOffer(supabase, {
        offerId: id,
        patch,
        expectedActiveRevisionId: existing.data.active_revision_id,
        changeReason:
          typeof body.revision_note === 'string' && body.revision_note.trim()
            ? body.revision_note.trim()
            : 'Offer definition updated in Compass.',
        createdBy: 'operator-ui'
      })
      return portalJson(data)
    }

    const updated = await supabase
      .from('compass_outbound_offers')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (updated.error) {
      return portalJson({ error: 'update_failed', detail: updated.error.message }, { status: 400 })
    }
    return portalJson(updated.data)
  } catch (err) {
    return (
      portalAccessResponse(err) ??
      portalJson(
        { error: 'update_failed', detail: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      )
    )
  }
}

export async function DELETE(request: NextRequest, context: Ctx) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  return archiveLibraryItem(request, 'compass_outbound_offers', id)
}
