import type { NextRequest } from 'next/server'
import { requireSameOrigin } from '@/lib/portal-http'
import { createLibraryItem, listLibrary, tagsFromBody } from '@/lib/outbound-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return listLibrary('compass_outbound_openers', request, ['label', 'opener_mode', 'body', 'notes'])
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  return createLibraryItem(request, 'compass_outbound_openers', (body, stamp) => {
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    const opener_mode = typeof body.opener_mode === 'string' ? body.opener_mode : 'custom'
    const text = typeof body.body === 'string' ? body.body : ''
    if (!label) return { error: 'fields_required' }
    return {
      id: `opener-${crypto.randomUUID()}`,
      label,
      opener_mode,
      body: text,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      vertical_tags: tagsFromBody(body.vertical_tags),
      archived: false,
      created_at: stamp,
      updated_at: stamp
    }
  })
}
