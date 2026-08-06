import { NextResponse, type NextRequest } from 'next/server'

import { metaOAuthUrl } from '@/lib/ad-sync/meta'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await requirePortalAccess({ operator: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'unauthorized' }, { status: 401 })
  }

  const appId = process.env.META_APP_ID?.trim()
  const appSecret = process.env.META_APP_SECRET?.trim()
  if (!appId || !appSecret) {
    return portalJson(
      {
        error: 'meta_oauth_not_configured',
        detail: 'Set META_APP_ID and META_APP_SECRET to enable Facebook OAuth.'
      },
      { status: 503 }
    )
  }

  const origin = request.nextUrl.origin
  const redirectUri = `${origin}/api/ads/oauth/meta/callback`
  const state = crypto.randomUUID()

  const response = NextResponse.redirect(
    metaOAuthUrl({ appId, redirectUri, state }),
    { status: 302 }
  )
  response.cookies.set('compass_meta_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https'),
    path: '/',
    maxAge: 600
  })
  return response
}
