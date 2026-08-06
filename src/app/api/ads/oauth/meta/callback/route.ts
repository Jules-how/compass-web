import { NextResponse, type NextRequest } from 'next/server'

import { encryptSecret } from '@/lib/ad-token-crypto'
import { listMetaAdAccounts, exchangeMetaCode } from '@/lib/ad-sync/meta'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

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
  const cookieState = request.cookies.get('compass_meta_oauth_state')?.value

  if (err) {
    return settingsRedirect(origin, { ads: 'meta_denied' })
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return settingsRedirect(origin, { ads: 'meta_state_mismatch' })
  }

  const appId = process.env.META_APP_ID?.trim()
  const appSecret = process.env.META_APP_SECRET?.trim()
  if (!appId || !appSecret) {
    return settingsRedirect(origin, { ads: 'meta_oauth_not_configured' })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const redirectUri = `${origin}/api/ads/oauth/meta/callback`
    const { accessToken, expiresIn } = await exchangeMetaCode({
      code,
      redirectUri,
      appId,
      appSecret
    })

    const accounts = await listMetaAdAccounts(accessToken)
    const stamp = new Date().toISOString()
    const expiresAt =
      typeof expiresIn === 'number'
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null

    for (const account of accounts) {
      const externalId = account.id.startsWith('act_') ? account.id : `act_${account.account_id}`
      const { data: existing } = await supabase
        .from('compass_ad_accounts')
        .select('id')
        .eq('platform', 'meta')
        .eq('external_account_id', externalId)
        .maybeSingle()

      const payload = {
        platform: 'meta' as const,
        external_account_id: externalId,
        account_name: account.name,
        currency: account.currency ?? null,
        status: 'connected' as const,
        access_token_enc: encryptSecret(accessToken),
        token_expires_at: expiresAt,
        last_error: null,
        updated_at: stamp
      }

      if (existing?.id) {
        await supabase.from('compass_ad_accounts').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('compass_ad_accounts').insert({
          id: `adacct-${crypto.randomUUID()}`,
          ...payload,
          meta: {},
          created_at: stamp
        })
      }
    }

    const response = settingsRedirect(origin, {
      ads: 'meta_connected',
      count: String(accounts.length)
    })
    response.cookies.set('compass_meta_oauth_state', '', { path: '/', maxAge: 0 })
    return response
  } catch (error) {
    const access = portalAccessResponse(error)
    if (access) return access
    return settingsRedirect(origin, { ads: 'meta_connect_failed' })
  }
}
