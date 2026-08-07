import type { NextRequest } from 'next/server'
import { requireSameOrigin } from '@/lib/portal-http'
import { createLibraryItem, listLibrary } from '@/lib/outbound-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return listLibrary('compass_outbound_structures', request, ['name', 'structure_id', 'description'], 'structure_id')
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  return createLibraryItem(request, 'compass_outbound_structures', (body, stamp) => {
    const structure_id = typeof body.structure_id === 'string' ? body.structure_id.trim() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!structure_id || !name) return { error: 'fields_required' }
    return {
      id: `struct-${crypto.randomUUID()}`,
      structure_id,
      name,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      slots: Array.isArray(body.slots) ? body.slots : [],
      is_default_candidate: Boolean(body.is_default_candidate),
      archived: false,
      created_at: stamp,
      updated_at: stamp
    }
  })
}
