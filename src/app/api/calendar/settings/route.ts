import type { NextRequest } from 'next/server'

import { CAMPAIGN_BOARD_COLUMNS, type CompassCampaign } from '@/lib/campaigns'
import { syncCampaignToGoogleCalendar } from '@/lib/campaign-google-calendar'
import {
  clearGoogleCalendarRefreshToken,
  googleCalendarOAuthConfigured,
  loadGoogleCalendarRefreshToken
} from '@/lib/google-calendar'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const refresh = await loadGoogleCalendarRefreshToken(supabase)
    return portalJsonCached({
      configured: googleCalendarOAuthConfigured(),
      connected: Boolean(refresh)
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const refresh = await loadGoogleCalendarRefreshToken(supabase)
    if (!refresh) {
      return portalJson({ error: 'google_calendar_not_connected' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('compass_pipeline_campaigns')
      .select(CAMPAIGN_BOARD_COLUMNS)
    if (error) {
      return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    }

    let synced = 0
    let failed = 0
    for (const row of (data ?? []) as CompassCampaign[]) {
      try {
        await syncCampaignToGoogleCalendar(supabase, row)
        synced += 1
      } catch {
        failed += 1
      }
    }

    return portalJson({ ok: failed === 0, synced, failed })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'sync_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    await clearGoogleCalendarRefreshToken(supabase)
    return portalJson({ ok: true, connected: false })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'disconnect_failed' }, { status: 500 })
  }
}
