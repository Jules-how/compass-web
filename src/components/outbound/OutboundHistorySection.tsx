'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { listLocalCampaigns } from '@/lib/campaign-local-store'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import { copyStatusLabel, LOCATION_TAG_HINTS, VERTICAL_TAG_HINTS } from '@/lib/outbound-copy'
import { demoOutboundBoard } from '@/lib/outbound-live-demo'
import { listLocalOffers } from '@/lib/outbound-local-store'
import { useCachedJson } from '@/lib/use-cached-json'
import Link from 'next/link'

type SortKey = 'date' | 'name' | 'leads' | 'sent' | 'reply'

type OutboundBoardPayload = {
  live: OutboundBoardCampaign[]
  history: OutboundBoardCampaign[]
  liveCount: number
  source?: 'instantly' | 'demo' | 'error'
}

function Select({
  value,
  onChange,
  options,
  label
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  label?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      {label ? (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
          {label}
        </span>
      ) : null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[12px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function OutboundHistorySection() {
  const board = useCachedJson<OutboundBoardPayload>(
    '/api/instantly/outbound-campaigns',
    '/api/instantly/outbound-campaigns',
    { staleMs: 60_000 }
  )
  const fallback = useMemo(() => demoOutboundBoard(), [])
  const instantlyHistory = board.data?.history ?? fallback.history
  const fromInstantly = board.data?.source === 'instantly'
  const localCampaigns = listLocalCampaigns()
  const offers = listLocalOffers()

  const [nameQ, setNameQ] = useState('')
  const [vertical, setVertical] = useState('all')
  const [location, setLocation] = useState('all')
  const [offer, setOffer] = useState('all')
  const [leadVolume, setLeadVolume] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState<SortKey>('date')

  const rows = useMemo(() => {
    let list: OutboundBoardCampaign[] = instantlyHistory.slice()

    // Merge local completed / non-live pipeline campaigns as lightweight history rows
    for (const c of localCampaigns) {
      if (c.status === 'completed' || c.copy_status === 'none' || c.status === 'cancelled') {
        if (list.some((r) => r.id === c.id || r.id === c.instantly_campaign_id)) continue
        list.push({
          id: c.id,
          name: c.name,
          status: 'completed',
          offer: c.offer_key || '—',
          offerKey: c.offer_key || '',
          copyNotes: c.cold_expression || c.summary || 'Local pipeline campaign',
          vertical: (c.vertical_tags ?? [])[0] || '',
          location: (c.location_tags ?? [])[0] || '',
          leadCount: 0,
          sendCount: 0,
          remaining: 0,
          progress: c.status === 'completed' ? 100 : 0,
          replyCount: 0,
          replyRate: 0,
          opportunities: 0,
          bouncedCount: 0,
          completedCount: 0,
          positiveReplies: 0,
          meetings: 0,
          startedAt: c.start_date || c.created_at.slice(0, 10),
          updatedAt: c.updated_at
        })
      }
    }

    list = list.filter((c) => {
      if (nameQ.trim() && !c.name.toLowerCase().includes(nameQ.trim().toLowerCase())) return false
      if (vertical !== 'all' && c.vertical !== vertical) return false
      if (location !== 'all' && c.location !== location) return false
      if (offer !== 'all' && c.offerKey !== offer && c.offer !== offer) return false
      if (dateFrom && c.startedAt && c.startedAt < dateFrom) return false
      if (dateTo && c.startedAt && c.startedAt > dateTo) return false
      if (leadVolume === 'low' && c.leadCount >= 1000) return false
      if (leadVolume === 'mid' && (c.leadCount < 1000 || c.leadCount >= 2500)) return false
      if (leadVolume === 'high' && c.leadCount < 2500) return false
      return true
    })

    list.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'leads':
          return b.leadCount - a.leadCount
        case 'sent':
          return b.sendCount - a.sendCount
        case 'reply':
          return b.replyRate - a.replyRate
        case 'date':
        default:
          return (b.updatedAt || b.name).localeCompare(a.updatedAt || a.name)
      }
    })

    return list
  }, [
    instantlyHistory,
    localCampaigns,
    nameQ,
    vertical,
    location,
    offer,
    leadVolume,
    dateFrom,
    dateTo,
    sort
  ])

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>History</CardTitle>
          <CardDescription>
            Completed Instantly campaigns — filter by name, volume, and reply rate
          </CardDescription>
        </div>
        <span
          className={
            fromInstantly
              ? 'rounded-xl bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700'
              : 'rounded-xl bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800'
          }
        >
          {fromInstantly ? 'Instantly' : 'Demo'}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Name
            </span>
            <input
              value={nameQ}
              onChange={(e) => setNameQ(e.target.value)}
              placeholder="Search campaigns…"
              className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              From
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[12px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              To
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[12px]"
            />
          </label>
          <Select
            label="Vertical"
            value={vertical}
            onChange={setVertical}
            options={[
              { value: 'all', label: 'All verticals' },
              ...VERTICAL_TAG_HINTS.map((t) => ({ value: t, label: t })),
              { value: 'vic', label: 'vic' }
            ]}
          />
          <Select
            label="Location"
            value={location}
            onChange={setLocation}
            options={[
              { value: 'all', label: 'All locations' },
              ...LOCATION_TAG_HINTS.map((t) => ({ value: t, label: t })),
              { value: 'vic', label: 'vic' }
            ]}
          />
          <Select
            label="Offer"
            value={offer}
            onChange={setOffer}
            options={[
              { value: 'all', label: 'All offers' },
              ...offers.map((o) => ({ value: o.offer_key, label: o.name }))
            ]}
          />
          <Select
            label="Lead volume"
            value={leadVolume}
            onChange={setLeadVolume}
            options={[
              { value: 'all', label: 'Any volume' },
              { value: 'low', label: 'Under 1k' },
              { value: 'mid', label: '1k – 2.5k' },
              { value: 'high', label: '2.5k+' }
            ]}
          />
          <Select
            label="Sort"
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            options={[
              { value: 'date', label: 'Most recent' },
              { value: 'name', label: 'Name' },
              { value: 'leads', label: 'Lead volume' },
              { value: 'sent', label: 'Send count' },
              { value: 'reply', label: 'Reply rate' }
            ]}
          />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-stone-200/70">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-100 bg-stone-50/60 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-3 py-3 font-medium">Leads</th>
                <th className="px-3 py-3 font-medium">Sent</th>
                <th className="px-3 py-3 font-medium">Replies</th>
                <th className="px-3 py-3 font-medium">Reply %</th>
                <th className="px-3 py-3 font-medium">Opps</th>
                <th className="px-4 py-3 font-medium">Ended</th>
              </tr>
            </thead>
            <tbody>
              {board.loading && !board.data ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                    Loading Instantly history…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                    No history matches these filters.
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="border-b border-stone-50 hover:bg-stone-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-900">{c.name}</div>
                      <div className="text-[11px] text-neutral-400">
                        {c.offer || c.location || 'Instantly'}
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-neutral-700">
                      {c.leadCount ? c.leadCount.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-neutral-700">
                      {c.sendCount ? c.sendCount.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-neutral-700">
                      {c.replyCount ? c.replyCount.toLocaleString() : '0'}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-neutral-700">
                      {c.replyRate ? `${c.replyRate}%` : '0%'}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-neutral-700">
                      {c.opportunities.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {c.updatedAt ? c.updatedAt.slice(0, 10) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {localCampaigns.some((c) => c.copy_status && c.copy_status !== 'none') ? (
          <div className="rounded-xl border border-stone-200/70 bg-stone-50/50 px-4 py-3 text-[12px] text-neutral-600">
            Pipeline drafts with copy still open in the{' '}
            <Link href="/sales/pipeline" className="font-medium text-[#c2410c] hover:underline">
              planner
            </Link>
            {' · '}
            {localCampaigns
              .filter((c) => c.copy_status && c.copy_status !== 'none')
              .slice(0, 3)
              .map((c) => (
                <Link
                  key={c.id}
                  href={`/sales/outbound/editor/${c.id}`}
                  className="mr-2 font-medium text-neutral-800 hover:text-[#c2410c]"
                >
                  {c.name} ({copyStatusLabel(c.copy_status || 'none')})
                </Link>
              ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
