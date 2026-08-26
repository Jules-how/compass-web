import type { NextRequest } from 'next/server'

import { clearQboConnection, loadQboRefreshToken, qboOAuthConfigured } from '@/lib/qbo'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached, requireSameOrigin } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const refresh = await loadQboRefreshToken(supabase)
    return portalJsonCached({
      configured: qboOAuthConfigured(),
      connected: Boolean(refresh)
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    await clearQboConnection(supabase)
    return portalJson({ ok: true, connected: false })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'disconnect_failed' }, { status: 500 })
  }
}
