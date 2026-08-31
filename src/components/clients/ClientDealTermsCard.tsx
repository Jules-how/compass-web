'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { amountsFromTier } from '@/lib/qbo-invoice.mjs'
import { defaultDealTerms } from '@/lib/qbo-deal'
import type { DealTerms, QboDealStatus, QboDealTier } from '@/lib/qbo-types'

function money(value: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
}

const STATUSES: Array<[QboDealStatus, string]> = [
  ['draft', 'Draft'],
  ['contracted', 'Contracted'],
  ['retainer_active', 'Retainer active'],
  ['paused', 'Paused'],
  ['ended', 'Ended']
]

export function ClientDealTermsCard({ clientId }: { clientId: string }) {
  const [terms, setTerms] = useState<DealTerms>(defaultDealTerms())
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const res = await fetch(`/api/clients/${clientId}/deal-terms`, { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as { dealTerms?: DealTerms; error?: string }
    if (!res.ok) throw new Error(body.error || `Failed to load deal terms (${res.status})`)
    if (body.dealTerms) setTerms(defaultDealTerms(body.dealTerms))
  }, [clientId])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [load])

  const amounts = amountsFromTier(terms.tier)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/deal-terms`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...terms,
          install_aud: amounts.installAud,
          monthly_aud: amounts.monthlyAud,
          gst_mode: 'exclusive'
        })
      })
      const body = (await res.json().catch(() => ({}))) as { dealTerms?: DealTerms; error?: string }
      if (!res.ok) throw new Error(body.error || `Save failed (${res.status})`)
      if (body.dealTerms) setTerms(defaultDealTerms(body.dealTerms))
      setMessage('Deal terms saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Deal terms</CardTitle>
          <CardDescription>Missed call booking. Amounts follow the van tier and stay exclusive of GST.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Tier</span>
              <select
                value={terms.tier}
                onChange={(event) => setTerms((prev) => ({ ...prev, tier: event.target.value as QboDealTier }))}
                className="compass-input"
                disabled={saving}
              >
                <option value="vans_3">Up to 3 vans · $1,497 / mo</option>
                <option value="vans_4_8">4 to 8 vans · $1,997 / mo</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Deal status</span>
              <select
                value={terms.status}
                onChange={(event) => setTerms((prev) => ({ ...prev, status: event.target.value as QboDealStatus }))}
                className="compass-input"
                disabled={saving}
              >
                {STATUSES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Start date</span>
              <input
                type="date"
                value={terms.start_date ?? ''}
                onChange={(event) => setTerms((prev) => ({ ...prev, start_date: event.target.value || null }))}
                className="compass-input"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Term (days)</span>
              <input
                type="number"
                min={1}
                value={terms.term_days}
                onChange={(event) =>
                  setTerms((prev) => ({ ...prev, term_days: Number(event.target.value) || 90 }))
                }
                className="compass-input"
                disabled={saving}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-xs text-neutral-500">Billing email</span>
              <input
                type="email"
                value={terms.billing_email}
                onChange={(event) => setTerms((prev) => ({ ...prev, billing_email: event.target.value }))}
                className="compass-input"
                disabled={saving}
              />
            </label>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 text-sm text-neutral-700">
            <div>Install + first 30 days: {money(amounts.installAud)} ex GST</div>
            <div>Monthly from month 2: {money(amounts.monthlyAud)} ex GST</div>
            <div className="mt-1 text-xs text-neutral-500">GST 10% is added on the QuickBooks invoice. PayID / Wise / transfer on the template.</div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

          <button type="submit" disabled={saving} className="compass-btn-primary">
            {saving ? 'Saving…' : 'Save deal terms'}
          </button>
        </form>
      </CardContent>
    </Card>
  )
}
