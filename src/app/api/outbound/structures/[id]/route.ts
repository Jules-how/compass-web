import type { NextRequest } from 'next/server'
import { requireSameOrigin } from '@/lib/portal-http'
import { archiveLibraryItem, getLibraryItem, patchLibraryItem } from '@/lib/outbound-api'

export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: Ctx) {
  const { id } = await context.params
  return getLibraryItem('compass_outbound_structures', id)
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  return patchLibraryItem(request, 'compass_outbound_structures', id, (body, _existing, stamp) => {
    const patch: Record<string, unknown> = { updated_at: stamp }
    if (typeof body.structure_id === 'string') patch.structure_id = body.structure_id.trim()
    if (typeof body.name === 'string') patch.name = body.name.trim()
    if (body.description !== undefined) {
      patch.description =
        typeof body.description === 'string' ? body.description.trim() || null : null
    }
    if (Array.isArray(body.slots)) patch.slots = body.slots
    if (typeof body.is_default_candidate === 'boolean') {
      patch.is_default_candidate = body.is_default_candidate
    }
    if (typeof body.archived === 'boolean') patch.archived = body.archived
    return patch
  })
}

export async function DELETE(request: NextRequest, context: Ctx) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  return archiveLibraryItem(request, 'compass_outbound_structures', id)
}
