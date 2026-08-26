'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { QBO_CONFIRM_CREATE } from '@/lib/qbo-invoice.mjs'
import type { QboDisplayState, QboInvoiceKind } from '@/lib/qbo-types'

type InvoiceRow = {
  qbo_invoice_id: string
  qbo_credit_memo_id: string | null
  doc_number: string | null
  doc_type: 'invoice' | 'credit_memo'
  due_date: string | null
  txn_date: string | null
  total_amt: number | null
  balance: number | null
  invoice_kind: QboInvoiceKind | null
  state: QboDisplayState
}

function money(value: number | null) {
  if (value == null || Number.isNaN(value)) return '-'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
}

function stateBadge(state: QboDisplayState) {
  const label = state.replace('_', ' ')
  if (state === 'paid') return <Badge variant="success" appearance="light" size="sm">Paid</Badge>
  if (state === 'overdue') return <Badge variant="destructive" appearance="light" size="sm">Overdue</Badge>
  if (state === 'partial') return <Badge variant="warning" appearance="light" size="sm">Partial</Badge>
  if (state === 'sent') return <Badge variant="primary" appearance="light" size="sm">Sent</Badge>
  if (state === 'void') return <Badge variant="secondary" appearance="light" size="sm">Void</Badge>
  return <Badge variant="secondary" appearance="light" size="sm">{label}</Badge>
}

export function ClientInvoicesCard({ clientId }: { clientId: string }) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [connected, setConnected] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [kind, setKind] = useState<QboInvoiceKind>('install_first_month')
  const [creditFor, setCreditFor] = useState<InvoiceRow | null>(null)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditMemo, setCreditMemo] = useState('Guarantee refund')

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/invoices`, { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as {
      invoices?: InvoiceRow[]
      connected?: boolean
      error?: string
    }
    if (!res.ok) throw new Error(body.error || `Failed to load invoices (${res.status})`)
    setConnected(body.connected !== false)
    setInvoices(body.invoices ?? [])
  }, [clientId])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [load])

  async function createInvoice() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind })
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error || `Create failed (${res.status})`)
      setConfirmOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function patch(action: 'send' | 'void' | 'credit_memo', invoice: InvoiceRow, extra?: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/invoices`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, invoiceId: invoice.qbo_invoice_id, ...extra })
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error || `Update failed (${res.status})`)
      setCreditFor(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>QuickBooks is the ledger. Compass only caches status.</CardDescription>
        </div>
        {connected ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="compass-btn-primary"
            disabled={busy}
          >
            Raise invoice
          </button>
        ) : (
          <a href="/api/qbo/connect" className="compass-btn-primary">
            Connect QuickBooks
          </a>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!connected ? (
          <p className="text-sm text-neutral-600">
            QuickBooks is not connected. Finances and invoices stay empty until Jules connects the AU company file.
          </p>
        ) : null}

        {invoices.length === 0 && connected ? (
          <p className="text-sm text-neutral-500">No cached QuickBooks documents yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {invoices.map((invoice) => (
              <li key={`${invoice.doc_type}-${invoice.qbo_invoice_id}-${invoice.qbo_credit_memo_id ?? ''}`} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-900">
                    {invoice.doc_type === 'credit_memo' ? 'Credit memo' : 'Invoice'} {invoice.doc_number || invoice.qbo_invoice_id}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {invoice.invoice_kind === 'monthly' ? 'Monthly retainer' : invoice.invoice_kind === 'install_first_month' ? 'Install + first 30 days' : invoice.doc_type}
                    {invoice.due_date ? ` · Due ${invoice.due_date}` : ''}
                    {` · ${money(invoice.total_amt)} · bal ${money(invoice.balance)}`}
                  </div>
                </div>
                {stateBadge(invoice.state)}
                {invoice.doc_type === 'invoice' && invoice.state !== 'void' ? (
                  <div className="flex flex-wrap gap-2">
                    {invoice.state === 'draft' || invoice.state === 'overdue' ? (
                      <button
                        type="button"
                        className="compass-btn-secondary"
                        disabled={busy}
                        onClick={() => void patch('send', invoice)}
                      >
                        Send
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="compass-btn-ghost"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Void this QuickBooks invoice?')) void patch('void', invoice)
                      }}
                    >
                      Void
                    </button>
                    <button
                      type="button"
                      className="compass-btn-ghost"
                      disabled={busy}
                      onClick={() => {
                        setCreditFor(invoice)
                        setCreditAmount(String(invoice.balance ?? invoice.total_amt ?? ''))
                        setCreditMemo('Guarantee refund')
                      }}
                    >
                      Credit memo
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {confirmOpen ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-soft">
            <p className="text-sm font-medium text-neutral-900">Raise a QuickBooks invoice</p>
            <p className="mt-2 text-sm text-neutral-600">{QBO_CONFIRM_CREATE}</p>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Kind</span>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as QboInvoiceKind)}
                className="compass-input"
                disabled={busy}
              >
                <option value="install_first_month">Install + first 30 days</option>
                <option value="monthly">Monthly retainer</option>
              </select>
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="compass-btn-primary" disabled={busy} onClick={() => void createInvoice()}>
                {busy ? 'Creating…' : 'Create in QuickBooks'}
              </button>
              <button type="button" className="compass-btn-secondary" disabled={busy} onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {creditFor ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-soft">
            <p className="text-sm font-medium text-neutral-900">Guarantee credit memo</p>
            <p className="mt-2 text-sm text-neutral-600">This creates a real credit memo in QuickBooks against the customer.</p>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Amount (ex GST)</span>
              <input
                value={creditAmount}
                onChange={(event) => setCreditAmount(event.target.value)}
                className="compass-input"
                disabled={busy}
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Memo</span>
              <input
                value={creditMemo}
                onChange={(event) => setCreditMemo(event.target.value)}
                className="compass-input"
                disabled={busy}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="compass-btn-primary"
                disabled={busy}
                onClick={() => void patch('credit_memo', creditFor, { amount: Number(creditAmount), memo: creditMemo })}
              >
                Create credit memo
              </button>
              <button type="button" className="compass-btn-secondary" disabled={busy} onClick={() => setCreditFor(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
