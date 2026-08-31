import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { qboAuthUrl, qboOAuthConfigured, qboRedirectUri } from '@/lib/qbo'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await requirePortalAccess({ operator: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'unauthorized' }, { status: 401 })
  }

  if (!qboOAuthConfigured()) {
    return portalJson(
      {
        error: 'qbo_not_configured',
        detail: 'Set QBO_CLIENT_ID, QBO_CLIENT_SECRET, and QBO_REDIRECT_URI.'
      },
      { status: 503 }
    )
  }

  const origin = request.nextUrl.origin
  const redirectUri = qboRedirectUri(origin)
  const state = crypto.randomUUID()
  const response = NextResponse.redirect(qboAuthUrl(redirectUri, state), { status: 302 })
  response.cookies.set('compass_qbo_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https'),
    path: '/',
    maxAge: 600
  })
  return response
}
