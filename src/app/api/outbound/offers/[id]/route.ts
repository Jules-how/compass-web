import type { NextRequest } from 'next/server'
import { requireSameOrigin } from '@/lib/portal-http'
import { archiveLibraryItem, getLibraryItem, patchLibraryItem, tagsFromBody } from '@/lib/outbound-api'
import { applyOfferSkuFields } from '@/lib/offer-sku'

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
  return patchLibraryItem(request, 'compass_outbound_offers', id, (body, _existing, stamp) => {
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
  })
}

export async function DELETE(request: NextRequest, context: Ctx) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  return archiveLibraryItem(request, 'compass_outbound_offers', id)
}
