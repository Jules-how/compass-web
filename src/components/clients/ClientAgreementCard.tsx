'use client'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { agreementDefaults, renderAgreement } from '@/lib/agreements.mjs'
type Row = {
  id: string
  status: string
  createdAt: string
  url: string
  payment?: { status: string }
  terms: ReturnType<typeof agreementDefaults>
}
export function ClientAgreementCard({
  clientId,
  clientName,
}: {
  clientId: string
  clientName: string
}) {
  const [terms, setTerms] = useState(() => agreementDefaults(clientName)),
    [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [cards, setCards] = useState(false),
    [reference, setReference] = useState('')
  const load = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/agreements`, {
      cache: 'no-store',
    })
    const b = await r.json()
    if (!r.ok) throw new Error(b.error)
    setRows(b.agreements)
    setCards(b.cardConfigured)
  }, [clientId])
  useEffect(() => {
    setTerms(agreementDefaults(clientName))
    setRows([])
    setError('')
    load().catch((e) => setError(e.message))
  }, [load, clientName])
  function field(k: string, v: unknown) {
    setTerms((t) => ({
      ...t,
      [k]: v,
      termsReviewed: k === 'termsReviewed' ? v === true : false,
    }))
  }
  async function act(action: string, id?: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const r = await fetch(`/api/clients/${clientId}/agreements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, agreementId: id, terms, reference }),
      })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error)
      await load()
      setMessage(
        action === 'create'
          ? 'Signing link created. No message has been sent.'
          : 'Agreement updated.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }
  const textFields = [
    ['clientName', 'Client legal name'],
    ['clientEmail', 'Authorised signatory email'],
    ['supplier', 'Supplier legal name'],
    ['supplierAbn', 'Supplier ABN'],
    ['serviceArea', 'Service area'],
    ['enquiryStream', 'Agreed enquiry stream'],
    ['startDate', 'Service start date'],
  ] as const
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Agreement & payment</CardTitle>
        <p className="text-sm text-neutral-500">
          Installation booking · explicit terms · no QuickBooks dependency
        </p>
      </CardHeader>
      <CardContent>
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mb-4 text-sm text-green-700">
            {message}
          </p>
        )}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void act('create')
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {textFields.map(([k, label]) => (
              <label key={k} className="text-sm">
                {label}
                <input
                  required
                  type={
                    k === 'startDate'
                      ? 'date'
                      : k === 'clientEmail'
                        ? 'email'
                        : 'text'
                  }
                  className="compass-input mt-1 w-full"
                  value={terms[k]}
                  onChange={(e) => field(k, e.target.value)}
                />
              </label>
            ))}
            {(['setupAud', 'monthlyAud'] as const).map((k) => (
              <label key={k} className="text-sm">
                {k === 'setupAud'
                  ? 'Agreed setup fee (AUD; enter 0 if waived)'
                  : 'Monthly service (AUD)'}
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className="compass-input mt-1 w-full"
                  value={terms[k]}
                  onChange={(e) => field(k, e.target.value)}
                />
              </label>
            ))}
            <label className="text-sm">
              GST treatment
              <select
                required
                value={terms.gstMode}
                onChange={(e) => field('gstMode', e.target.value)}
                className="compass-input mt-1 w-full"
              >
                <option value="">Confirm registration and treatment</option>
                <option value="not_registered">Not registered — no GST</option>
                <option value="exclusive">Registered — add 10% GST</option>
                <option value="inclusive">
                  Registered — amounts include GST
                </option>
              </select>
            </label>
            <label className="text-sm">
              Payment method
              <select
                value={terms.paymentMethod}
                onChange={(e) => field('paymentMethod', e.target.value)}
                className="compass-input mt-1 w-full"
              >
                <option value="bank">Bank / Wise transfer</option>
                <option value="stripe" disabled={!cards}>
                  Card + monthly autopay{cards ? '' : ' — connection required'}
                </option>
              </select>
            </label>
          </div>
          {!cards && (
            <p className="text-xs text-neutral-500">
              Card checkout needs a Stripe account connection and verified
              webhook. Bank payment requires your verified account details
              below.
            </p>
          )}
          {(
            [
              ['scope', 'Included service'],
              ['exclusions', 'Excluded work'],
              ['successMeasure', 'Success and measurement'],
              ['billingTerms', 'Billing schedule'],
              ['cancellation', 'Minimum term and cancellation'],
              ['additionalTerms', 'Additional agreed terms'],
              ...(terms.paymentMethod === 'bank'
                ? [
                    [
                      'bankInstructions',
                      'Verified bank / Wise payment instructions',
                    ],
                  ]
                : []),
            ] as [string, string][]
          ).map(([k, label]) => (
            <label key={k} className="block text-sm">
              {label}
              <textarea
                className="compass-input mt-1 w-full"
                rows={3}
                value={String((terms as Record<string, unknown>)[k] || '')}
                onChange={(e) => field(k, e.target.value)}
              />
            </label>
          ))}
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Review the exact signing document
            </summary>
            <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6">
              {renderAgreement(terms)}
            </pre>
          </details>
          <label className="flex gap-3 text-sm">
            <input
              required
              type="checkbox"
              checked={terms.termsReviewed}
              onChange={(e) => field('termsReviewed', e.target.checked)}
            />
            I have reviewed the scope, amounts, tax, billing, cancellation and
            signing document. These are the terms I intend to offer this client.
          </label>
          <button className="compass-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Create signing link'}
          </button>
        </form>
        <div className="mt-6 space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">
                  {r.status} · initial payment:{' '}
                  {r.payment?.status || 'not paid'} ·{' '}
                  {new Date(r.createdAt).toLocaleDateString('en-AU')}
                </span>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="compass-btn-ghost"
                >
                  Open agreement
                </a>
                <button
                  className="compass-btn-ghost"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(r.url)
                      .then(() => setMessage('Link copied.'))
                      .catch(() =>
                        setError(
                          'Copy failed. Open the agreement and copy its address.',
                        ),
                      )
                  }}
                >
                  Copy link
                </button>
                {r.status === 'issued' && (
                  <button
                    disabled={busy}
                    className="compass-btn-ghost"
                    onClick={() => void act('revoke', r.id)}
                  >
                    Revoke link
                  </button>
                )}
                {r.status === 'signed' && (
                  <button
                    disabled={busy}
                    className="compass-btn-ghost"
                    onClick={() => void act('refresh', r.id)}
                  >
                    Refresh payment / delivery tasks
                  </button>
                )}
              </div>
              {r.status === 'signed' &&
                r.terms.paymentMethod === 'bank' &&
                r.payment?.status !== 'paid' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="text-sm">
                      Verified bank transaction reference
                      <input
                        className="compass-input ml-2"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={busy || reference.trim().length < 4}
                      className="compass-btn-secondary"
                      onClick={() => void act('bank_paid', r.id)}
                    >
                      Confirm received payment
                    </button>
                  </div>
                )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
