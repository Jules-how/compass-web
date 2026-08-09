import type { NextRequest } from 'next/server'

import {
  INSTANTLY_API_KEY_SETTING_ID,
  InstantlyApiError,
  fetchInstantlyAnalyticsOverview,
  getInstantlyApiKey,
  getInstantlyTimezone,
  calendarDateInTimezone
} from '@/lib/instantly'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

/**
 * GET /api/instantly/settings — whether Instantly is configured (never returns the key).
 */
export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const fromEnv = Boolean(getInstantlyApiKey())
    const { data: settingsRow } = await supabase
      .from('compass_settings')
      .select('id')
      .eq('id', INSTANTLY_API_KEY_SETTING_ID)
      .maybeSingle()
    const settingsConfigured = Boolean(settingsRow?.id)

    return portalJsonCached({
      configured: fromEnv || settingsConfigured,
      source: fromEnv
        ? ('env' as const)
        : settingsConfigured
          ? ('settings' as const)
          : ('none' as const),
      timezone: getInstantlyTimezone()
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

/**
 * POST /api/instantly/settings — save Instantly API key into compass_settings.
 * Body: { apiKey: string } — empty string clears the stored key.
 */
export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: { apiKey?: string }
  try {
    body = (await readBoundedJson(request, 8 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const stamp = new Date().toISOString()

    if (!apiKey) {
      await supabase.from('compass_settings').delete().eq('id', INSTANTLY_API_KEY_SETTING_ID)
      return portalJson({ ok: true, configured: Boolean(getInstantlyApiKey()), source: getInstantlyApiKey() ? 'env' : 'none' })
    }

    // Validate against Instantly before persisting.
    const today = calendarDateInTimezone(new Date(), getInstantlyTimezone())
    try {
      await fetchInstantlyAnalyticsOverview(apiKey, today, today)
    } catch (err) {
      if (err instanceof InstantlyApiError) {
        return portalJson(
          { error: 'instantly_invalid_key', detail: err.message },
          { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
        )
      }
      throw err
    }

    const { error } = await supabase.from('compass_settings').upsert({
      id: INSTANTLY_API_KEY_SETTING_ID,
      value: apiKey,
      is_secret: 1,
      scope: 'integrations',
      updated_at: stamp,
      mirrored_at: stamp
    })
    if (error) {
      return portalJson({ error: 'save_failed', detail: error.message }, { status: 500 })
    }

    return portalJson({
      ok: true,
      configured: true,
      source: getInstantlyApiKey() ? 'env' : 'settings'
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'save_failed' }, { status: 500 })
  }
}
