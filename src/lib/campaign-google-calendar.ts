import type { SupabaseClient } from '@supabase/supabase-js'

import { campaignStatusLabel, dateOnlyInZone, GO_LIVE_TIMEZONE } from '@/lib/campaigns'
import {
  deleteGoogleCalendarEvent,
  loadGoogleCalendarRefreshToken,
  upsertGoogleCalendarEvent,
  type GoogleCalendarEventBody
} from '@/lib/google-calendar'

export function addOneCalendarDay(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return next.toISOString().slice(0, 10)
}

export function allDayRangeForGoLive(
  goLiveAt: string,
  timeZone: string = GO_LIVE_TIMEZONE
): { start: string; end: string } {
  const start = dateOnlyInZone(goLiveAt, timeZone)
  return { start, end: addOneCalendarDay(start) }
}

export function campaignCalendarEventTitle(name: string): string {
  return `Go live · ${name.trim() || 'Campaign'}`
}

export function campaignCalendarEventDescription(input: {
  id: string
  name: string
  status: string
  summary?: string | null
}): string {
  const base =
    process.env.COMPASS_BASE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}` : '')
  const lines = [
    'Compass email campaign go-live (all-day, does not block time).',
    `Campaign: ${input.name}`,
    `Status: ${campaignStatusLabel(input.status)}`
  ]
  if (input.summary?.trim()) lines.push(input.summary.trim())
  if (base) lines.push(`Open in Compass: ${base}/sales/pipeline/${encodeURIComponent(input.id)}`)
  return lines.join('\n')
}

export function campaignCalendarEventBody(input: {
  id: string
  name: string
  status: string
  go_live_at: string
  summary?: string | null
}): GoogleCalendarEventBody {
  const range = allDayRangeForGoLive(input.go_live_at)
  return {
    summary: campaignCalendarEventTitle(input.name),
    description: campaignCalendarEventDescription(input),
    start: { date: range.start },
    end: { date: range.end },
    transparency: 'transparent',
    visibility: 'private',
    reminders: { useDefault: false, overrides: [] },
    extendedProperties: { private: { compassCampaignId: input.id } }
  }
}

function shouldRemoveCalendarEvent(status: string, goLiveAt: string | null | undefined): boolean {
  if (!goLiveAt) return true
  const value = status.trim().toLowerCase()
  return value === 'cancelled'
}

export async function syncCampaignToGoogleCalendar(
  supabase: SupabaseClient,
  campaign: {
    id: string
    name: string
    status: string
    go_live_at: string | null
    summary?: string | null
    google_calendar_event_id?: string | null
  }
): Promise<string | null> {
  const refreshToken = await loadGoogleCalendarRefreshToken(supabase)
  if (!refreshToken) return campaign.google_calendar_event_id ?? null

  const existingId = campaign.google_calendar_event_id?.trim() || null

  if (shouldRemoveCalendarEvent(campaign.status, campaign.go_live_at)) {
    if (existingId) {
      await deleteGoogleCalendarEvent({ refreshToken, eventId: existingId })
      await supabase
        .from('compass_pipeline_campaigns')
        .update({ google_calendar_event_id: null, updated_at: new Date().toISOString() })
        .eq('id', campaign.id)
    }
    return null
  }

  const eventId = await upsertGoogleCalendarEvent({
    refreshToken,
    eventId: existingId,
    body: campaignCalendarEventBody({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      go_live_at: campaign.go_live_at as string,
      summary: campaign.summary
    })
  })

  if (eventId !== existingId) {
    await supabase
      .from('compass_pipeline_campaigns')
      .update({ google_calendar_event_id: eventId, updated_at: new Date().toISOString() })
      .eq('id', campaign.id)
  }

  return eventId
}

export async function syncCampaignToGoogleCalendarQuiet(
  supabase: SupabaseClient,
  campaign: {
    id: string
    name: string
    status: string
    go_live_at: string | null
    summary?: string | null
    google_calendar_event_id?: string | null
  }
): Promise<void> {
  try {
    await syncCampaignToGoogleCalendar(supabase, campaign)
  } catch (err) {
    console.error('[google-calendar]', campaign.id, err instanceof Error ? err.message : err)
  }
}

export async function deleteCampaignGoogleCalendarEvent(
  supabase: SupabaseClient,
  eventId: string | null | undefined
): Promise<void> {
  const id = eventId?.trim()
  if (!id) return
  try {
    const refreshToken = await loadGoogleCalendarRefreshToken(supabase)
    if (!refreshToken) return
    await deleteGoogleCalendarEvent({ refreshToken, eventId: id })
  } catch (err) {
    console.error('[google-calendar] delete', err instanceof Error ? err.message : err)
  }
}
