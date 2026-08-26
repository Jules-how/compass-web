import type { NextRequest } from 'next/server'

import { amountsFromTier } from '@/lib/qbo-invoice.mjs'
import { defaultDealTerms, parseDealTerms } from '@/lib/qbo-deal'
import type { DealTerms } from '@/lib/qbo-types'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  let body: Partial<DealTerms>
  try {
    body = (await readBoundedJson(request)) as Partial<DealTerms>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const amounts = amountsFromTier(body.tier)
  const dealTerms = defaultDealTerms({
    ...body,
    install_aud: amounts.installAud,
    monthly_aud: amounts.monthlyAud,
    gst_mode: 'exclusive'
  })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_clients')
      .update({ deal_terms: dealTerms, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id,deal_terms,qbo_customer_id')
      .maybeSingle()
    if (error) return portalJson({ error: 'save_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({
      dealTerms: parseDealTerms(data.deal_terms),
      qboCustomerId: data.qbo_customer_id ?? null
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'save_failed' }, { status: 500 })
  }
}
