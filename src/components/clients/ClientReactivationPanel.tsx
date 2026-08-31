'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type SampleMessage = {
  touch_index: number
  channel: string
  template_id: string
  body: string
}

type ReactivationList = {
  id: string
  pack_id: string
  name: string
  status: string
  counts: {
    imported: number
    rejected: number
    no_consent: number
    eligible: number
    suppressed?: number
    replied?: number
    booked?: number
    showed?: number
    opted_out?: number
  }
  consentPct: number
  bonus_metric: string | null
  licensee_signoff_required: boolean
  sampleMessages: SampleMessage[]
  rejectSample: Array<{ id: string; mobile: string; name: string | null; reason: unknown }>
  activated_at: string | null
  created_at: string
}

type ReactivationPayload = {
  clientId: string
  clientName: string
  packs: string[]
  lists: ReactivationList[]
}

interface ClientReactivationPanelProps {
  clientId: string
  saving?: boolean
  onBusy?: (busy: boolean) => void
  onError?: (message: string | null) => void
}

function statusTone(status: string): string {
  if (status === 'active') return 'bg-emerald-50 text-emerald-800'
  if (status === 'review') return 'bg-sky-50 text-sky-800'
  if (status === 'paused') return 'bg-amber-50 text-amber-800'
  return 'bg-stone-100 text-stone-600'
}

export function ClientReactivationPanel({
  clientId,
  saving = false,
  onBusy = () => {},
  onError = () => {}
}: ClientReactivationPanelProps) {
  const [data, setData] = useState<ReactivationPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [packId, setPackId] = useState('brokers_dead_leads')
  const [listName, setListName] = useState('')
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [licenseeSignoff, setLicenseeSignoff] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/reactivation`, { cache: 'no-store' })
      const body = (await res.json()) as ReactivationPayload & { error?: string }
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      setData(body)
      if (!selectedListId && body.lists.length > 0) {
        setSelectedListId(body.lists[0].id)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [clientId, onError, selectedListId])

  useEffect(() => {
    void load()
  }, [load])

  const selectedList = data?.lists.find((l) => l.id === selectedListId) ?? null

  async function uploadCsv() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      onError('Choose a CSV file first')
      return
    }
    onBusy(true)
    onError(null)
    try {
      const form = new FormData()
      form.set('pack_id', packId)
      form.set('file', file)
      if (listName.trim()) form.set('name', listName.trim())
      const res = await fetch(`/api/clients/${clientId}/reactivation`, {
        method: 'POST',
        body: form
      })
      const body = (await res.json()) as { error?: string; listId?: string }
      if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`)
      if (body.listId) setSelectedListId(body.listId)
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  function downloadRejects() {
    if (!selectedList) return
    const rows = [
      ['mobile', 'name', 'reason'],
      ...selectedList.rejectSample.map((r) => [
        r.mobile,
        r.name ?? '',
        String(r.reason ?? '')
      ])
    ]
    const csv = rows.map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedList.name}-rejects.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function activateList() {
    if (!selectedList) return
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/reactivation/${selectedList.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'activate',
          confirm: true,
          licensee_signoff: licenseeSignoff
        })
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || `Activate failed (${res.status})`)
      setConfirmOpen(false)
      setLicenseeSignoff(false)
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  async function pauseList() {
    if (!selectedList) return
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/reactivation/${selectedList.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' })
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || `Pause failed (${res.status})`)
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  if (loading) {
    return (
      <Card className="compass-panel">
        <CardContent className="p-6 text-sm text-stone-500">Loading reactivation…</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="compass-panel">
        <CardHeader>
          <CardTitle className="compass-page-title text-lg">Database reactivation</CardTitle>
          <CardDescription className="compass-page-subtitle">
            Import a consented list, review hygiene, then activate when ready. Nothing sends until you confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="compass-section-label">Pack</span>
              <select
                className="compass-input mt-1 w-full"
                value={packId}
                onChange={(e) => setPackId(e.target.value)}
                disabled={saving}
              >
                {(data?.packs ?? []).map((id) => (
                  <option key={id} value={id}>
                    {id.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="compass-section-label">List name (optional)</span>
              <input
                className="compass-input mt-1 w-full"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="e.g. March dead leads"
                disabled={saving}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block flex-1 min-w-[200px]">
              <span className="compass-section-label">CSV upload</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="compass-input mt-1 w-full"
                disabled={saving}
              />
            </label>
            <button
              type="button"
              className="compass-btn-primary"
              onClick={() => void uploadCsv()}
              disabled={saving}
            >
              Import list
            </button>
          </div>
        </CardContent>
      </Card>

      {data && data.lists.length > 0 ? (
        <Card className="compass-panel">
          <CardHeader>
            <CardTitle className="text-base font-medium">List health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <select
              className="compass-input w-full max-w-md"
              value={selectedListId ?? ''}
              onChange={(e) => setSelectedListId(e.target.value)}
            >
              {data.lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.pack_id})
                </option>
              ))}
            </select>

            {selectedList ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-xl px-2 py-1 text-xs font-medium ${statusTone(selectedList.status)}`}>
                    {selectedList.status}
                  </span>
                  {selectedList.bonus_metric ? (
                    <span className="text-xs text-stone-500">
                      Bonus: {selectedList.bonus_metric.replace(/_/g, ' ')}
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  {[
                    ['Imported', selectedList.counts.imported],
                    ['Eligible', selectedList.counts.eligible],
                    ['Rejected', selectedList.counts.rejected],
                    ['No consent', selectedList.counts.no_consent],
                    ['Replied', selectedList.counts.replied ?? 0],
                    ['Booked', selectedList.counts.booked ?? 0],
                    ['Showed', selectedList.counts.showed ?? 0],
                    ['Opted out', selectedList.counts.opted_out ?? 0]
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-stone-200/80 bg-white/60 p-3"
                    >
                      <div className="text-[11px] uppercase tracking-wide text-stone-400">{label}</div>
                      <div className="text-lg font-semibold text-stone-800">{value}</div>
                    </div>
                  ))}
                </div>

                <p className="text-sm text-stone-600">
                  Consent coverage: <strong>{selectedList.consentPct}%</strong> of imported rows have a provable basis.
                </p>

                {selectedList.counts.rejected > 0 ? (
                  <button
                    type="button"
                    className="compass-btn-secondary text-sm"
                    onClick={downloadRejects}
                  >
                    Download reject sample
                  </button>
                ) : null}

                <div className="space-y-2">
                  <h4 className="compass-section-label">Sample SMS preview</h4>
                  {selectedList.sampleMessages.map((msg) => (
                    <div
                      key={msg.template_id}
                      className="rounded-xl border border-stone-200/80 bg-stone-50/80 p-4 text-sm text-stone-700"
                    >
                      <div className="mb-1 text-[11px] text-stone-400">
                        Touch {msg.touch_index + 1} · {msg.template_id}
                      </div>
                      {msg.body}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {selectedList.status === 'review' || selectedList.status === 'paused' ? (
                    <button
                      type="button"
                      className="compass-btn-primary"
                      disabled={saving || selectedList.counts.eligible === 0}
                      onClick={() => setConfirmOpen(true)}
                    >
                      Activate sequence
                    </button>
                  ) : null}
                  {selectedList.status === 'active' ? (
                    <button
                      type="button"
                      className="compass-btn-secondary"
                      disabled={saving}
                      onClick={() => void pauseList()}
                    >
                      Pause
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card className="compass-panel">
          <CardContent className="p-6 text-sm text-stone-500">
            No lists yet. Upload a CSV to start.
          </CardContent>
        </Card>
      )}

      {confirmOpen && selectedList ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="compass-panel w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
            <h3 className="text-lg font-semibold text-stone-900">Activate reactivation?</h3>
            <p className="mt-2 text-sm text-stone-600">
              This will enroll {selectedList.counts.eligible} contacts. SMS sends only during quiet hours
              (08:00–21:00 local). Any reply stops the sequence.
            </p>
            {selectedList.licensee_signoff_required ? (
              <label className="mt-4 flex items-start gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={licenseeSignoff}
                  onChange={(e) => setLicenseeSignoff(e.target.checked)}
                />
                <span>
                  Licensed broker has reviewed and signed off on all message templates (ASIC advice boundary).
                </span>
              </label>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="compass-btn-ghost"
                onClick={() => {
                  setConfirmOpen(false)
                  setLicenseeSignoff(false)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="compass-btn-primary"
                disabled={
                  saving ||
                  (selectedList.licensee_signoff_required && !licenseeSignoff)
                }
                onClick={() => void activateList()}
              >
                Confirm activate
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Mount in ClientDetailPanel (Delivery tab):
 *   <ClientReactivationPanel clientId={client.id} saving={saving} onBusy={setBusy} onError={setError} />
 */
