import type { NextRequest } from 'next/server'
import { requireSameOrigin } from '@/lib/portal-http'
import { createLibraryItem, listLibrary, tagsFromBody } from '@/lib/outbound-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return listLibrary(
    'compass_outbound_expressions',
    request,
    ['label', 'offer_key', 'body', 'status', 'notes']
  )
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  return createLibraryItem(request, 'compass_outbound_expressions', (body, stamp) => {
    const offer_key = typeof body.offer_key === 'string' ? body.offer_key.trim() : ''
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    const bodyText = typeof body.body === 'string' ? body.body.trim() : ''
    if (!offer_key || !label || !bodyText) return { error: 'fields_required' }
    return {
      id: `expr-${crypto.randomUUID()}`,
      offer_key,
      label,
      body: bodyText,
      vertical_tags: tagsFromBody(body.vertical_tags),
      location_tags: tagsFromBody(body.location_tags),
      status: typeof body.status === 'string' ? body.status : 'draft',
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      archived: false,
      created_at: stamp,
      updated_at: stamp,
      provenance: 'yours',
      source_creator: null,
      source_file: null
    }
  })
}
