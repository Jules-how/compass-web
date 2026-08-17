import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { googleCalendarAuthUrl, googleCalendarOAuthConfigured } from '@/lib/google-calendar'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await requirePortalAccess({ operator: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'unauthorized' }, { status: 401 })
  }

  if (!googleCalendarOAuthConfigured()) {
    return portalJson(
      {
        error: 'google_calendar_not_configured',
        detail: 'Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET.'
      },
      { status: 503 }
    )
  }

  const origin = request.nextUrl.origin
  const redirectUri = `${origin}/api/calendar/oauth/callback`
  const state = crypto.randomUUID()
  const response = NextResponse.redirect(googleCalendarAuthUrl(redirectUri, state), { status: 302 })
  response.cookies.set('compass_gcal_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https'),
    path: '/',
    maxAge: 600
  })
  return response
}
