import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { decryptSecret, encryptSecret } from '@/lib/ad-token-crypto'
import type { GoogleAdsConfigStatus } from '@/lib/google-attach/types'

export const GOOGLE_ADS_REFRESH_SETTING_ID = 'integrations.google_ads.refresh_token'
export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export function googleAdsOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_CLIENT_ID?.trim() && process.env.GOOGLE_ADS_CLIENT_SECRET?.trim()
  )
}

export function googleAdsApiConfigured(): GoogleAdsConfigStatus {
  const missing: string[] = []
  if (!process.env.GOOGLE_ADS_CLIENT_ID?.trim()) missing.push('GOOGLE_ADS_CLIENT_ID')
  if (!process.env.GOOGLE_ADS_CLIENT_SECRET?.trim()) missing.push('GOOGLE_ADS_CLIENT_SECRET')
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim()) missing.push('GOOGLE_ADS_DEVELOPER_TOKEN')
  if (!process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim()) missing.push('GOOGLE_ADS_LOGIN_CUSTOMER_ID')
  return { configured: missing.length === 0, missing }
}

export function googleAdsLoginCustomerId(): string {
  return String(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '')
    .replace(/-/g, '')
    .trim()
}

export function googleAdsDeveloperToken(): string {
  return process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() || ''
}

export function googleAdsAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim()
  if (!clientId) throw new Error('google_ads_not_configured')
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_ADS_SCOPE)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeGoogleAdsCode(input: {
  code: string
  redirectUri: string
}): Promise<{ refreshToken: string }> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) throw new Error('google_ads_not_configured')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code'
    })
  })
  const body = (await res.json().catch(() => ({}))) as {
    refresh_token?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !body.refresh_token) {
    throw new Error(body.error_description || body.error || 'google_ads_token_exchange_failed')
  }
  return { refreshToken: body.refresh_token }
}

export async function loadGoogleAdsRefreshToken(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('compass_settings')
    .select('value')
    .eq('id', GOOGLE_ADS_REFRESH_SETTING_ID)
    .maybeSingle()
  const raw = typeof data?.value === 'string' ? data.value.trim() : ''
  if (!raw) return null
  try {
    return decryptSecret(raw)
  } catch {
    return raw
  }
}

export async function saveGoogleAdsRefreshToken(
  supabase: SupabaseClient,
  refreshToken: string
): Promise<void> {
  const stamp = new Date().toISOString()
  const { error } = await supabase.from('compass_settings').upsert({
    id: GOOGLE_ADS_REFRESH_SETTING_ID,
    value: encryptSecret(refreshToken),
    is_secret: 1,
    scope: 'integrations',
    updated_at: stamp,
    mirrored_at: stamp
  })
  if (error) throw new Error(error.message)
}

export async function clearGoogleAdsRefreshToken(supabase: SupabaseClient): Promise<void> {
  await supabase.from('compass_settings').delete().eq('id', GOOGLE_ADS_REFRESH_SETTING_ID)
}

export async function accessTokenFromGoogleAdsRefresh(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) throw new Error('google_ads_not_configured')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    })
  })
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || 'google_ads_refresh_failed')
  }
  return body.access_token
}
