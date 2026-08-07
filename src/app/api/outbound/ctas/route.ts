import type { NextRequest } from 'next/server'
import { requireSameOrigin } from '@/lib/portal-http'
import { createLibraryItem, listLibrary, tagsFromBody } from '@/lib/outbound-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return listLibrary('compass_outbound_ctas', request, ['label', 'body', 'cta_type'])
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  return createLibraryItem(request, 'compass_outbound_ctas', (body, stamp) => {
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    const text = typeof body.body === 'string' ? body.body.trim() : ''
    const cta_type = typeof body.cta_type === 'string' ? body.cta_type : 'permission'
    if (!label || !text) return { error: 'fields_required' }
    return {
      id: `cta-${crypto.randomUUID()}`,
      label,
      body: text,
      cta_type,
      vertical_tags: tagsFromBody(body.vertical_tags),
      location_tags: tagsFromBody(body.location_tags),
      is_default: Boolean(body.is_default),
      archived: false,
      created_at: stamp,
      updated_at: stamp
    }
  })
}
