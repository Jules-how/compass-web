'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatRelativeTouch } from '@/lib/client-pm'

type OnboardingFormSummary = {
  id: string
  status: 'sent' | 'opened' | 'submitted' | 'expired'
  offerKey: string
  offerRevisionId: string | null
  engagementId: string | null
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
  const [onboardingReady, setOnboardingReady] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const res = await fetch(`/api/clients/${clientId}/onboarding`, { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as {
      form?: OnboardingFormSummary | null
      onboardingReady?: boolean
      error?: string
    }
    if (!res.ok) throw new Error(body.error || `Failed to load (${res.status})`)
    setForm(body.form ?? null)
    setOnboardingReady(body.onboardingReady === true)
  }, [clientId])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)))
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ clientId?: string }>).detail
      if (detail?.clientId === clientId) {
        void load().catch((err) => setError(err instanceof Error ? err.message : String(err)))
      }
    }
    window.addEventListener('compass:engagement-updated', refresh)
    return () => window.removeEventListener('compass:engagement-updated', refresh)
  }, [clientId, load])

  async function sendForm() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
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
          <CardDescription>Send the scoped setup form after the agreement is signed and payment is confirmed.</CardDescription>
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
              {form.offerRevisionId ? (
                <span className="text-xs text-neutral-500">Pinned revision {form.offerRevisionId.slice(-8)}</span>
              ) : null}
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
          <p className="text-sm text-neutral-600">
            {onboardingReady
              ? 'The signed, paid engagement is ready for onboarding.'
              : 'Onboarding is locked until a revision-pinned agreement is signed and payment is confirmed.'}
          </p>
        )}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

        <button
          type="button"
          onClick={() => void sendForm()}
          disabled={busy || (!onboardingReady && !form)}
          className="compass-btn-primary"
        >
          {busy ? 'Creating…' : form ? 'Send new link' : 'Send onboarding form'}
        </button>
      </CardContent>
    </Card>
  )
}
