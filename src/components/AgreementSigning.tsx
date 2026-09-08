'use client'
import { useCallback, useEffect, useState } from 'react'
import { moneyAud } from '@/lib/agreements.mjs'
type PublicAgreement = {
  document: string
  documentHash: string
  status: string
  expiresAt: string
  signature: { name: string; email: string; acceptedAt: string } | null
  payment: { status: string; reference?: string } | null
  paymentMethod: string
  bankInstructions: string
  dueAud: number
}
export function AgreementSigning({ token }: { token: string }) {
  const [a, setA] = useState<PublicAgreement | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [consent, setConsent] = useState(false)
  const load = useCallback(async () => {
    const r = await fetch(`/api/signing/${encodeURIComponent(token)}`, {
      cache: 'no-store',
    })
    const b = await r.json()
    if (!r.ok) throw new Error(b.error)
    setA(b.agreement)
  }, [token])
  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [load])
  async function act(action: string) {
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/signing/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          name,
          email,
          consent,
          documentHash: a?.documentHash,
        }),
      })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error)
      if (b.url) {
        window.location.assign(b.url)
        return
      }
      setA(b.agreement)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.')
      await load().catch(() => {})
    } finally {
      setBusy(false)
    }
  }
  const expired = a?.status === 'issued' && Date.parse(a.expiresAt) < Date.now()
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-sm font-medium text-neutral-500">Switchflow</p>
      <h1 className="mt-2 text-3xl font-semibold">Your service agreement</h1>
      <p className="mt-3 text-sm text-neutral-600 print:hidden">
        Read the complete agreement, keep a copy, then accept and arrange
        payment.
      </p>
      {error && (
        <p role="alert" className="my-4 rounded-xl bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}
      {!a && !error && <p role="status">Loading agreement…</p>}
      {a && (
        <>
          <article className="my-6 rounded-2xl border bg-white p-6">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-7">
              {a.document}
            </pre>
          </article>
          <p className="break-all text-xs text-neutral-500">
            Document fingerprint: {a.documentHash}
          </p>
          <button
            type="button"
            className="compass-btn-ghost my-4 print:hidden"
            onClick={() => window.print()}
          >
            Print / save PDF
          </button>
          {a.signature && (
            <p className="my-4">
              Accepted by {a.signature.name} ({a.signature.email}) on{' '}
              {new Date(a.signature.acceptedAt).toLocaleString('en-AU')}.
            </p>
          )}
          {a.status === 'revoked' && (
            <p>
              This agreement was revoked. Contact Switchflow for a replacement.
            </p>
          )}
          {expired && (
            <p>This link expired. Ask Switchflow for a new agreement.</p>
          )}
          {a.status === 'issued' && !expired && (
            <form
              className="space-y-4 print:hidden"
              onSubmit={(e) => {
                e.preventDefault()
                void act('accept')
              }}
            >
              <label className="block">
                Full name
                <input
                  required
                  autoComplete="name"
                  className="compass-input mt-1 w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block">
                Signatory email shown in the agreement
                <input
                  required
                  type="email"
                  autoComplete="email"
                  className="compass-input mt-1 w-full"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="flex gap-3 text-sm">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I have read this agreement, am authorised to sign for the
                client, and agree to electronic acceptance.
              </label>
              <button className="compass-btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Accept agreement'}
              </button>
            </form>
          )}
          {a.status === 'signed' && (
            <section className="my-6 rounded-2xl border bg-white p-6 print:hidden">
              <h2 className="text-xl font-semibold">Payment</h2>
              {a.payment?.status === 'paid' ? (
                <p className="mt-3">
                  Initial payment confirmed. Reference: {a.payment.reference}
                </p>
              ) : (
                <>
                  <p className="my-3">
                    Agreement accepted. Payment is not yet confirmed.
                  </p>
                  <p className="my-3">
                    Setup and first-month total: {moneyAud(a.dueAud)}. Follow
                    the billing schedule in your agreement.
                  </p>
                  {a.paymentMethod === 'stripe' ? (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => void act('checkout')}
                        className="compass-btn-primary"
                      >
                        Continue to secure card checkout
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void act('refresh')}
                        className="compass-btn-ghost ml-2"
                      >
                        Check payment
                      </button>
                      <p className="mt-3 text-sm text-neutral-500">
                        Checkout starts the monthly subscription described
                        above. Card details are handled by the payment provider.
                      </p>
                    </>
                  ) : (
                    <>
                      <pre className="whitespace-pre-wrap font-sans text-sm">
                        {a.bankInstructions}
                      </pre>
                      <p className="mt-3 text-sm">
                        Use the client name as your reference. Switchflow will
                        confirm receipt against the bank transaction. A transfer
                        screenshot is not treated as cleared payment.
                      </p>
                    </>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}
