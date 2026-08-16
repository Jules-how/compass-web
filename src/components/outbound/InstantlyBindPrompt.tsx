'use client'

import { useEffect, useState } from 'react'
import type { CompassCampaign } from '@/lib/campaigns'
import { listCampaigns, updateCampaign } from '@/lib/campaigns-client'
import { isWorkshopCampaign } from '@/lib/outbound-factor-performance'

export function InstantlyBindPrompt({
  instantlyCampaignId,
  instantlyName,
  onBound
}: {
  instantlyCampaignId: string
  instantlyName: string
  onBound: (compassId: string) => void
}) {
  const [campaigns, setCampaigns] = useState<CompassCampaign[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void listCampaigns()
      .then((rows) => {
        if (cancelled) return
        const liveIds = new Set([instantlyCampaignId])
        const options = rows.filter(
          (row) => isWorkshopCampaign(row, liveIds) || !row.instantly_campaign_id
        )
        setCampaigns(options)
        setSelectedId(options[0]?.id ?? '')
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load campaigns')
      })
    return () => {
      cancelled = true
    }
  }, [instantlyCampaignId])

  async function bind() {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      await updateCampaign(selectedId, { instantly_campaign_id: instantlyCampaignId })
      onBound(selectedId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link campaign')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-950">
      <p className="font-semibold">This Instantly campaign is not linked to Compass copy.</p>
      <p className="mt-1 text-[13px] text-amber-900/80">
        {instantlyName} · Instantly id{' '}
        <code className="text-[12px]">{instantlyCampaignId}</code>. Leads still list from Compass.
        Sequence editing stays off until you bind a workshop campaign. Activate stays in Instantly.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-amber-800/70">
            Compass campaign
          </span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-[13px]"
          >
            {campaigns.length === 0 ? <option value="">No workshop campaigns</option> : null}
            {campaigns.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!selectedId || busy}
          onClick={() => void bind()}
          className="rounded-xl bg-[#e85d2a] px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Linking…' : 'Link'}
        </button>
      </div>
      {error ? <p className="mt-2 text-[12px] text-red-700">{error}</p> : null}
    </div>
  )
}
