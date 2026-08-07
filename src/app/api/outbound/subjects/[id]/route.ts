import type { NextRequest } from 'next/server'
import { requireSameOrigin } from '@/lib/portal-http'
import { archiveLibraryItem, getLibraryItem, patchLibraryItem, tagsFromBody } from '@/lib/outbound-api'

export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: Ctx) {
  const { id } = await context.params
  return getLibraryItem('compass_outbound_subjects', id)
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  return patchLibraryItem(request, 'compass_outbound_subjects', id, (body, _existing, stamp) => {
    const patch: Record<string, unknown> = { updated_at: stamp }
    if (typeof body.label === 'string') patch.label = body.label.trim()
    if (typeof body.pattern === 'string') patch.pattern = body.pattern.trim()
    if (body.notes !== undefined) {
      patch.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
    }
    if (body.vertical_tags !== undefined) patch.vertical_tags = tagsFromBody(body.vertical_tags)
    if (typeof body.archived === 'boolean') patch.archived = body.archived
    return patch
  })
}

export async function DELETE(request: NextRequest, context: Ctx) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  return archiveLibraryItem(request, 'compass_outbound_subjects', id)
}
