import { after } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import { refreshEvidenceIfStale } from '@/lib/evidence-poller'
import { loadHomePayload } from '@/lib/home-data'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    after(() => {
      void refreshEvidenceIfStale(supabase).catch((err) => {
        console.error('home evidence refresh failed', err)
      })
    })
    const payload = await loadHomePayload(supabase)
    return portalJsonCached(payload)
  } catch (err) {
    const access = portalAccessResponse(err)
    if (!access) console.error('home payload failed', err)
    return access ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
