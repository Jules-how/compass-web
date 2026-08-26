'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ClientVoiceConfig, VoiceCallRow } from '@/lib/types'

type VoicePayload = {
  clientId: string
  clientName: string
  voice: ClientVoiceConfig
  calls: VoiceCallRow[]
}

function formatWhen(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

function gateItem(ok: boolean, label: string): string {
  return `${ok ? '✓' : '○'} ${label}`
}

export function ClientVoicePanel({ clientId }: { clientId: string }) {
  const [data, setData] = useState<VoicePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/voice`, { cache: 'no-store' })
      const body = (await res.json()) as VoicePayload & { error?: string }
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void load()
  }, [load])

  const voice = data?.voice ?? {}
  const calls = data?.calls ?? []

  const hasNumber = Boolean(voice.twilio_number)
  const hasAgent = Boolean(voice.retell_agent_id)
  const hasPack = Boolean(voice.trade_pack_id)
  const probeOk = voice.probe_ok === true
  const forwardingOk = Boolean(voice.forwarding_confirmed_at)
  const live = Boolean(voice.live_at)
  const testCallBooked = calls.some((c) => c.outcome === 'booked')
  const calendarBroken = voice.calendar_grant_broken === true

  const checklist = [
    gateItem(hasNumber, 'Twilio AU mobile provisioned'),
    gateItem(hasAgent, 'Retell agent bound'),
    gateItem(hasPack, `Trade pack (${voice.trade_pack_id ?? 'missing'})`),
    gateItem(probeOk && !calendarBroken, 'Calendar probe passed'),
    gateItem(forwardingOk, 'Forwarding confirmed on owner handset'),
    gateItem(testCallBooked, 'Test call booked (artefact in calls list)'),
    gateItem(live, 'Go-live gate passed')
  ]

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Voice delivery</CardTitle>
          <CardDescription>Missed-call booking: Retell voice, Twilio SMS, Google Calendar grant.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? <p className="text-sm text-neutral-500">Loading voice status…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-stone-200/80 p-4">
                <p className="compass-section-label mb-1">Twilio number</p>
                <p className="text-sm font-medium">{voice.twilio_number ?? 'Not provisioned'}</p>
              </div>
              <div className="rounded-xl border border-stone-200/80 p-4">
                <p className="compass-section-label mb-1">Retell agent</p>
                <p className="text-sm font-medium">{voice.retell_agent_id ?? 'Not set'}</p>
              </div>
              <div className="rounded-xl border border-stone-200/80 p-4">
                <p className="compass-section-label mb-1">Trade pack</p>
                <p className="text-sm font-medium">{voice.trade_pack_id ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-stone-200/80 p-4">
                <p className="compass-section-label mb-1">Calendar</p>
                <p className="text-sm font-medium">
                  {voice.calendar_id ?? '—'}
                  {calendarBroken ? (
                    <span className="ml-2 text-red-600">Grant broken</span>
                  ) : probeOk ? (
                    <span className="ml-2 text-emerald-700">Probe OK</span>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-stone-200/80 p-4">
              <p className="compass-section-label mb-2">Go-live checklist</p>
              <ul className="space-y-1 text-sm text-neutral-700">
                {checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-neutral-500">
                Transfer: {voice.transfer_enabled === false ? 'off' : 'on'} · Owner alerts:{' '}
                {voice.owner_alert_mode ?? 'live'} · After hours: {voice.after_hours_mode ?? 'no_answer'}
              </p>
            </div>

            <div>
              <p className="compass-section-label mb-2">Recent calls</p>
              {calls.length === 0 ? (
                <p className="text-sm text-neutral-500">No calls logged yet.</p>
              ) : (
                <ul className="space-y-2">
                  {calls.map((call) => (
                    <li
                      key={call.id}
                      className="rounded-xl border border-stone-200/80 p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{call.outcome ?? 'unknown'}</span>
                        <span className="text-neutral-500">{formatWhen(call.started_at)}</span>
                      </div>
                      <p className="text-neutral-600">
                        {[call.job_type, call.suburb, call.urgency].filter(Boolean).join(' · ') ||
                          call.from_number ||
                          '—'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {call.recording_url ? (
                          <a
                            href={call.recording_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#c45c26] hover:underline"
                          >
                            Recording
                          </a>
                        ) : null}
                        {call.transcript ? (
                          <span className="text-neutral-500" title={call.transcript}>
                            Transcript on file
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Mount in ClientDetailPanel (Overview or Delivery tab):
 *   <ClientVoicePanel clientId={client.id} />
 */
