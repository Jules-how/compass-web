import type { NextRequest } from 'next/server'

import { loadFinances } from '@/lib/qbo-finances'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const params = request.nextUrl.searchParams
    const payload = await loadFinances({
      supabase,
      clientId: params.get('client'),
      industry: params.get('vertical') || params.get('industry'),
      offer: params.get('offer'),
      from: params.get('from'),
      to: params.get('to')
    })
    return portalJsonCached(payload)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'finances_failed' }, { status: 500 })
  }
}
