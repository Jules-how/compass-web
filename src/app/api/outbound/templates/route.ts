import type { NextRequest } from 'next/server'
import { requireSameOrigin } from '@/lib/portal-http'
import { createLibraryItem, listLibrary, tagsFromBody } from '@/lib/outbound-api'
import { isValidSequence } from '@/lib/outbound-copy'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return listLibrary('compass_outbound_templates', request, ['name', 'offer_key', 'structure_id'])
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  return createLibraryItem(request, 'compass_outbound_templates', (body, stamp) => {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const structure_id = typeof body.structure_id === 'string' ? body.structure_id.trim() : ''
    if (!name || !structure_id) return { error: 'fields_required' }
    if (!isValidSequence(body.sequence)) return { error: 'invalid_sequence' }
    return {
      id: `tmpl-${crypto.randomUUID()}`,
      name,
      offer_key: typeof body.offer_key === 'string' ? body.offer_key.trim() || null : null,
      structure_id,
      vertical_tags: tagsFromBody(body.vertical_tags),
      location_tags: tagsFromBody(body.location_tags),
      sequence: body.sequence,
      archived: false,
      created_at: stamp,
      updated_at: stamp,
      provenance: 'yours',
      source_creator: null,
      source_file: null
    }
  })
}
