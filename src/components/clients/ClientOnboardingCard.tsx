'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatRelativeTouch } from '@/lib/client-pm'

type OnboardingFormSummary = {
  id: string
  status: 'sent' | 'opened' | 'submitted' | 'expired'
  offerKey: string
  sentAt: string
  openedAt: string | null
  submittedAt: string | null
  url: string
}

function statusLabel(status: OnboardingFormSummary['status']): string {
  switch (status) {
    case 'sent':
      return 'Sent'
    case 'opened':
      return 'Opened'
    case 'submitted':
      return 'Submitted'
    case 'expired':
      return 'Expired'
    default:
      return status
  }
}

function statusTone(status: OnboardingFormSummary['status']): string {
  switch (status) {
    case 'submitted':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'opened':
      return 'bg-amber-50 text-amber-800 ring-amber-200'
    case 'expired':
      return 'bg-neutral-100 text-neutral-600 ring-neutral-200'
    default:
      return 'bg-sky-50 text-sky-700 ring-sky-200'
  }
}

export function ClientOnboardingCard({ clientId }: { clientId: string }) {
  const [form, setForm] = useState<OnboardingFormSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const res = await fetch(`/api/clients/${clientId}/onboarding`, { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as { form?: OnboardingFormSummary | null; error?: string }
    if (!res.ok) throw new Error(body.error || `Failed to load (${res.status})`)
    setForm(body.form ?? null)
  }, [clientId])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [load])

  async function sendForm() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerKey: 'booked-jobs-system' })
      })
      const body = (await res.json().catch(() => ({}))) as { form?: OnboardingFormSummary; error?: string }
      if (!res.ok) throw new Error(body.error || `Send failed (${res.status})`)
      if (body.form) {
        setForm(body.form)
        await navigator.clipboard.writeText(body.form.url)
        setMessage('Link copied to clipboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!form?.url) return
    await navigator.clipboard.writeText(form.url)
    setMessage('Link copied')
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Onboarding form</CardTitle>
          <CardDescription>Send the branded setup form after a signed deal.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {form ? (
          <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/80 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusTone(form.status)}`}
              >
                {statusLabel(form.status)}
              </span>
              <span className="text-xs text-neutral-500">Sent {formatRelativeTouch(form.sentAt)}</span>
            </div>
            {form.openedAt ? (
              <p className="text-xs text-neutral-600">Opened {formatRelativeTouch(form.openedAt)}</p>
            ) : null}
            {form.submittedAt ? (
              <p className="text-xs text-neutral-600">Submitted {formatRelativeTouch(form.submittedAt)}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copyLink()} className="compass-btn-secondary text-xs">
                Copy link
              </button>
              <a href={form.url} target="_blank" rel="noreferrer" className="compass-btn-ghost text-xs">
                Preview
              </a>
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-600">No form sent yet.</p>
        )}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

        <button type="button" onClick={() => void sendForm()} disabled={busy} className="compass-btn-primary">
          {busy ? 'Creating…' : form ? 'Send new link' : 'Send onboarding form'}
        </button>
      </CardContent>
    </Card>
  )
}
