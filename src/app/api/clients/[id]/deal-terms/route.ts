import type { NextRequest } from 'next/server'

import { parseDealTerms } from '@/lib/qbo-deal'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_clients')
      .select('id,deal_terms,qbo_customer_id')
      .eq('id', id)
      .maybeSingle()
    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({
      dealTerms: parseDealTerms(data.deal_terms),
      qboCustomerId: data.qbo_customer_id ?? null
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, _context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  return portalJson(
    {
      error: 'legacy_deal_terms_read_only',
      detail: 'Create a revision-pinned agreement instead. Van-tier defaults are historical and cannot govern new work.'
    },
    { status: 410 }
  )
}
