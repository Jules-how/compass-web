import { NextResponse, type NextRequest } from 'next/server'

import {
  createQboClient,
  exchangeQboCode,
  qboRedirectUri,
  saveQboConnection
} from '@/lib/qbo'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function settingsRedirect(origin: string, params: Record<string, string>) {
  const url = new URL('/settings', origin)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url, { status: 302 })
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const realmId = request.nextUrl.searchParams.get('realmId')
  const err = request.nextUrl.searchParams.get('error')
  const cookieState = request.cookies.get('compass_qbo_oauth_state')?.value

  if (err) return settingsRedirect(origin, { qbo: 'denied' })
  if (!code || !state || !cookieState || state !== cookieState) {
    return settingsRedirect(origin, { qbo: 'state_mismatch' })
  }
  if (!realmId) return settingsRedirect(origin, { qbo: 'connect_failed' })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const redirectUri = qboRedirectUri(origin)
    const tokens = await exchangeQboCode({ code, redirectUri })
    await saveQboConnection(supabase, { refreshToken: tokens.refreshToken, realmId })
    const qbo = createQboClient({ supabase })
    await qbo.cacheTaxAndItems()
    const response = settingsRedirect(origin, { qbo: 'connected' })
    response.cookies.set('compass_qbo_oauth_state', '', { path: '/', maxAge: 0 })
    return response
  } catch (error) {
    const access = portalAccessResponse(error)
    if (access) return access
    return settingsRedirect(origin, { qbo: 'connect_failed' })
  }
}
