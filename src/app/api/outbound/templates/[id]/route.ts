import type { NextRequest } from 'next/server'
import { requireSameOrigin } from '@/lib/portal-http'
import { archiveLibraryItem, getLibraryItem, patchLibraryItem, tagsFromBody } from '@/lib/outbound-api'
import { isValidSequence } from '@/lib/outbound-copy'

export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: Ctx) {
  const { id } = await context.params
  return getLibraryItem('compass_outbound_templates', id)
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  return patchLibraryItem(request, 'compass_outbound_templates', id, (body, _existing, stamp) => {
    const patch: Record<string, unknown> = { updated_at: stamp }
    if (typeof body.name === 'string') patch.name = body.name.trim()
    if (body.offer_key !== undefined) {
      patch.offer_key = typeof body.offer_key === 'string' ? body.offer_key.trim() || null : null
    }
    if (typeof body.structure_id === 'string') patch.structure_id = body.structure_id.trim()
    if (body.vertical_tags !== undefined) patch.vertical_tags = tagsFromBody(body.vertical_tags)
    if (body.location_tags !== undefined) patch.location_tags = tagsFromBody(body.location_tags)
    if (body.sequence !== undefined) {
      if (!isValidSequence(body.sequence)) return { error: 'invalid_sequence' }
      patch.sequence = body.sequence
    }
    if (typeof body.archived === 'boolean') patch.archived = body.archived
    return patch
  })
}

export async function DELETE(request: NextRequest, context: Ctx) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  return archiveLibraryItem(request, 'compass_outbound_templates', id)
}
