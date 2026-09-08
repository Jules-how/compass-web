'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { moneyAud } from '@/lib/agreements.mjs'
type Expense = {
  id: string
  date: string
  vendor: string
  amountAud: number
  category: string
  account: string
  reference: string
  receiptUrl: string
  notes: string
}
const empty = () => ({
  date: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
  }).format(new Date()),
  vendor: '',
  amountAud: '',
  category: 'Software',
  account: '',
  reference: '',
  receiptUrl: '',
  notes: '',
})
export function ExpenseBoard() {
  const requestId = useRef<string | null>(null)
  const [form, setForm] = useState(empty),
    [rows, setRows] = useState<Expense[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0)
  const load = useCallback(async () => {
    const r = await fetch(`/api/expenses?page=${page}`, { cache: 'no-store' })
    const b = await r.json()
    if (!r.ok) throw new Error(b.error)
    setRows(b.expenses)
    setTotal(b.total)
  }, [page])
  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [load])
  async function save() {
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amountAud: Number(form.amountAud),
          requestId:
            requestId.current || (requestId.current = crypto.randomUUID()),
        }),
      })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error)
      requestId.current = null
      setForm(empty())
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save expense.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
          <p className="text-sm text-neutral-500">
            Record actual AUD expenses with their bank or receipt reference. No
            QuickBooks connection is needed. These are manually recorded costs;
            there is no automatic bank feed or GST-credit calculation.
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <p role="alert" className="mb-4 text-red-700">
              {error}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            {(
              [
                ['date', 'Date paid'],
                ['vendor', 'Vendor'],
                ['amountAud', 'Amount paid (AUD)'],
                ['category', 'Category'],
                ['account', 'Paid from (bank / Wise / card)'],
                ['reference', 'Transaction or receipt reference'],
                ['receiptUrl', 'Receipt link (optional)'],
                ['notes', 'Notes (optional)'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="text-sm">
                {label}
                <input
                  required={!['receiptUrl', 'notes'].includes(k)}
                  type={
                    k === 'date'
                      ? 'date'
                      : k === 'amountAud'
                        ? 'number'
                        : k === 'receiptUrl'
                          ? 'url'
                          : 'text'
                  }
                  min={k === 'amountAud' ? '0.01' : undefined}
                  step={k === 'amountAud' ? '0.01' : undefined}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className="compass-input mt-1 w-full"
                />
              </label>
            ))}
            <button
              disabled={busy}
              className="compass-btn-primary justify-self-start"
            >
              {busy ? 'Saving…' : 'Record expense'}
            </button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {moneyAud(rows.reduce((n, r) => n + r.amountAud, 0))} on this page
          </CardTitle>
          <p className="text-sm text-neutral-500">
            {total} recorded expenses · newest expense dates first
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    'Date',
                    'Vendor',
                    'Category',
                    'Account',
                    'Reference',
                    'Amount',
                  ].map((h) => (
                    <th key={h} scope="col" className="p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.date}</td>
                    <td className="p-2">{r.vendor}</td>
                    <td className="p-2">{r.category}</td>
                    <td className="p-2">{r.account}</td>
                    <td className="p-2">
                      {r.receiptUrl ? (
                        <a
                          href={r.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {r.reference}
                        </a>
                      ) : (
                        r.reference
                      )}
                    </td>
                    <td className="p-2">{moneyAud(r.amountAud)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="py-4 text-sm text-neutral-500">
                No expenses recorded on this page.
              </p>
            )}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="compass-btn-ghost"
            >
              Previous
            </button>
            <button
              disabled={(page + 1) * 100 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="compass-btn-ghost"
            >
              Next
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
