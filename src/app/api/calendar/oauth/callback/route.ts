import { NextResponse, type NextRequest } from 'next/server'

import { CAMPAIGN_BOARD_COLUMNS, type CompassCampaign } from '@/lib/campaigns'
import { syncCampaignToGoogleCalendarQuiet } from '@/lib/campaign-google-calendar'
import { exchangeGoogleCalendarCode, saveGoogleCalendarRefreshToken } from '@/lib/google-calendar'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function settingsRedirect(origin: string, params: Record<string, string>) {
  const url = new URL('/settings', origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url, { status: 302 })
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const err = request.nextUrl.searchParams.get('error')
  const cookieState = request.cookies.get('compass_gcal_oauth_state')?.value

  if (err) {
    return settingsRedirect(origin, { calendar: 'denied' })
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return settingsRedirect(origin, { calendar: 'state_mismatch' })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const redirectUri = `${origin}/api/calendar/oauth/callback`
    const { refreshToken } = await exchangeGoogleCalendarCode({ code, redirectUri })
    await saveGoogleCalendarRefreshToken(supabase, refreshToken)

    const { data } = await supabase
      .from('compass_pipeline_campaigns')
      .select(CAMPAIGN_BOARD_COLUMNS)
    for (const row of (data ?? []) as CompassCampaign[]) {
      await syncCampaignToGoogleCalendarQuiet(supabase, row)
    }

    const response = settingsRedirect(origin, { calendar: 'connected' })
    response.cookies.set('compass_gcal_oauth_state', '', { path: '/', maxAge: 0 })
    return response
  } catch (error) {
    const access = portalAccessResponse(error)
    if (access) return access
    return settingsRedirect(origin, { calendar: 'connect_failed' })
  }
}
