import type { NextRequest } from 'next/server'
import { requireSameOrigin } from '@/lib/portal-http'
import { createLibraryItem, listLibrary, tagsFromBody } from '@/lib/outbound-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return listLibrary('compass_outbound_offers', request, ['name', 'offer_key', 'pack_summary'], 'sort_order')
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  return createLibraryItem(request, 'compass_outbound_offers', (body, stamp) => {
    const offer_key = typeof body.offer_key === 'string' ? body.offer_key.trim() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const pack_summary = typeof body.pack_summary === 'string' ? body.pack_summary.trim() : ''
    if (!offer_key || !name || !pack_summary) return { error: 'fields_required' }
    return {
      id: `offer-${crypto.randomUUID()}`,
      offer_key,
      name,
      pack_summary,
      positioning_line:
        typeof body.positioning_line === 'string' ? body.positioning_line.trim() || null : null,
      vertical_tags: tagsFromBody(body.vertical_tags),
      location_tags: tagsFromBody(body.location_tags),
      sort_order: typeof body.sort_order === 'number' ? body.sort_order : 100,
      archived: false,
      created_at: stamp,
      updated_at: stamp,
      provenance: 'yours',
      source_creator: null,
      source_file: null
    }
  })
}
