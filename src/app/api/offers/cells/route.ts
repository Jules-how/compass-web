import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  createMissingOfferCells,
  parseCreateOfferCellsBody
} from '@/lib/offer-test-cells-server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request, 32 * 1024)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const parsed = parseCreateOfferCellsBody(body)
  if ('error' in parsed) return portalJson({ error: parsed.error }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const result = await createMissingOfferCells(supabase, parsed)
    return portalJson({ ok: true, ...result })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    const message = err instanceof Error ? err.message : 'create_failed'
    if (message === 'offer_not_found' || message === 'clone_not_found') {
      return portalJson({ error: message }, { status: 404 })
    }
    return portalJson({ error: 'create_failed', detail: message }, { status: 500 })
  }
}
