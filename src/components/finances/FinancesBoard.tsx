'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { FinancesPayload, FinanceInvoiceRow } from '@/lib/qbo-finance-types'
import type { QboBoardBucket, QboDisplayState } from '@/lib/qbo-types'
import { LoadingBlock } from '@/components/LoadingBlock'

function money(value: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
}

function stateChip(state: QboDisplayState) {
  if (state === 'paid') return <Badge variant="success" appearance="light" size="sm">Paid</Badge>
  if (state === 'overdue') return <Badge variant="destructive" appearance="light" size="sm">Overdue</Badge>
  if (state === 'partial') return <Badge variant="warning" appearance="light" size="sm">Partial</Badge>
  if (state === 'sent') return <Badge variant="primary" appearance="light" size="sm">Sent</Badge>
  if (state === 'void') return <Badge variant="secondary" appearance="light" size="sm">Void</Badge>
  return <Badge variant="secondary" appearance="light" size="sm">Draft</Badge>
}

const BUCKETS: Array<[QboBoardBucket, string]> = [
  ['past', 'Past'],
  ['due', 'Due'],
  ['future', 'Future']
]

export function FinancesBoard() {
  const [data, setData] = useState<FinancesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [client, setClient] = useState('')
  const [vertical, setVertical] = useState('')
  const [offer, setOffer] = useState('')

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (client) params.set('client', client)
    if (vertical) params.set('vertical', vertical)
    if (offer) params.set('offer', offer)
    const qs = params.toString()
    return qs ? `/api/qbo/finances?${qs}` : '/api/qbo/finances'
  }, [client, vertical, offer])

  const load = useCallback(async () => {
    setError(null)
    const res = await fetch(query, { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as FinancesPayload & { error?: string }
    if (!res.ok) throw new Error(body.error || `Failed to load finances (${res.status})`)
    setData(body)
  }, [query])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [load])

  if (error && !data) {
    return (
      <div className="compass-panel p-6 text-sm text-red-600">
        {error}{' '}
        <button type="button" className="font-medium text-[#c2410c] hover:underline" onClick={() => void load()}>
          Retry finances
        </button>
      </div>
    )
  }

  if (!data) {
    return <LoadingBlock label="Loading finances…" />
  }

  if (!data.connected) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>QuickBooks is not connected</CardTitle>
            <CardDescription>
              Compass does not keep a second set of books. Income, spend, and invoices come from the AU QuickBooks company file only.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-600">
            {data.configured
              ? 'OAuth env is set. Connect the company file to load invoices and expenses.'
              : 'Set QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, and QBO_ENV, then connect.'}
          </p>
          {data.configured ? (
            <a href="/api/qbo/connect" className="compass-btn-primary">
              Connect QuickBooks
            </a>
          ) : (
            <a href="/settings" className="compass-btn-secondary">
              Open settings
            </a>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Income" value={money(data.income)} hint="Collected (invoice total minus balance)" />
        <Kpi label="Spend" value={money(data.spend)} hint="QBO purchases by expense account" />
        <Kpi label="Profit" value={money(data.profit)} hint="Income minus spend" />
        <Kpi label="90 day projection" value={money(data.projection90)} hint="Unpaid dues plus contracted retainers. No pipeline weighting." />
      </div>

      <section className="compass-panel space-y-4 p-5">
        <div className="compass-section-label">Filters</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Client</span>
            <select value={client} onChange={(event) => setClient(event.target.value)} className="compass-input">
              <option value="">All clients</option>
              {data.clients.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Vertical</span>
            <select value={vertical} onChange={(event) => setVertical(event.target.value)} className="compass-input">
              <option value="">All verticals</option>
              {data.industries.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Offer</span>
            <select value={offer} onChange={(event) => setOffer(event.target.value)} className="compass-input">
              <option value="">All offers</option>
              {data.offers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {BUCKETS.map(([key, label]) => (
          <Card key={key}>
            <CardHeader>
              <div>
                <CardTitle>{label}</CardTitle>
                <CardDescription>{data.board[key].length} invoices</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <InvoiceList rows={data.board[key]} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Spend by account</CardTitle>
            <CardDescription>From QuickBooks purchases. Nothing is typed in Compass.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {data.spendGroups.length === 0 ? (
            <p className="text-sm text-neutral-500">No expense lines in the current window.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.spendGroups.map((group) => (
                <li key={group.accountName} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-neutral-800">{group.accountName}</span>
                  <span className="tabular-nums text-neutral-700">{money(group.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="compass-panel p-5">
      <div className="compass-section-label">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-neutral-900">{value}</div>
      <p className="mt-1 text-xs text-neutral-500">{hint}</p>
    </div>
  )
}

function InvoiceList({ rows }: { rows: FinanceInvoiceRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">None in this lane.</p>
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="rounded-xl border border-stone-200 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-neutral-900">{row.client_name}</div>
              <div className="text-xs text-neutral-500">
                {row.doc_number || row.qbo_invoice_id}
                {row.due_date ? ` · due ${row.due_date}` : ''}
              </div>
            </div>
            {stateChip(row.state)}
          </div>
          <div className="mt-2 text-sm tabular-nums text-neutral-700">{money(Number(row.total_amt || 0))}</div>
        </li>
      ))}
    </ul>
  )
}
