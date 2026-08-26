import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached, readBoundedJson, requireSameOrigin } from '@/lib/portal-http'
import { loadHomePayload } from '@/lib/home-data'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const payload = await loadHomePayload(supabase)
    return portalJsonCached(payload)
  } catch (err) {
    const access = portalAccessResponse(err)
    if (!access) console.error('home payload failed', err)
    return access ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
