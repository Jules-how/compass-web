import type { NextRequest } from 'next/server'
import { requireSameOrigin } from '@/lib/portal-http'
import { createLibraryItem, listLibrary, tagsFromBody } from '@/lib/outbound-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return listLibrary('compass_outbound_subjects', request, ['label', 'pattern', 'notes'])
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  return createLibraryItem(request, 'compass_outbound_subjects', (body, stamp) => {
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    const pattern = typeof body.pattern === 'string' ? body.pattern.trim() : ''
    if (!label || !pattern) return { error: 'fields_required' }
    return {
      id: `subj-${crypto.randomUUID()}`,
      label,
      pattern,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      vertical_tags: tagsFromBody(body.vertical_tags),
      archived: false,
      created_at: stamp,
      updated_at: stamp,
      provenance: 'yours',
      source_creator: null,
      source_file: null
    }
  })
}
