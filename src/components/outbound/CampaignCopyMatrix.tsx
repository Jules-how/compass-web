'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CAMPAIGNS_QUERY_KEY } from '@/lib/campaigns-client'
import type { CompassCampaign } from '@/lib/campaigns'
import { copyStatusLabel, LOCATION_TAG_HINTS, VERTICAL_TAG_HINTS } from '@/lib/outbound-copy'
import { listLocalOffers } from '@/lib/outbound-local-store'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

export function CampaignCopyMatrix({
  offerKey,
  vertical,
  location
}: {
  offerKey?: string
  vertical?: string
  location?: string
} = {}) {
  const [offerFilter, setOfferFilter] = useState(offerKey || 'all')
  const [verticalFilter, setVerticalFilter] = useState(vertical || 'all')
  const [locationFilter, setLocationFilter] = useState(location || 'all')
  const [copyFilter, setCopyFilter] = useState('all')
  const offers = listLocalOffers()
  const campaignsQuery = useCachedJson<{ campaigns: CompassCampaign[] }>(
    CAMPAIGNS_QUERY_KEY,
    '/api/campaigns',
    { staleMs: 30_000 }
  )

  const rows = useMemo(() => {
    const campaigns = campaignsQuery.data?.campaigns ?? []
    return campaigns.filter((c) => {
      if (offerFilter !== 'all' && c.offer_key !== offerFilter) return false
      if (verticalFilter !== 'all' && !(c.vertical_tags ?? []).includes(verticalFilter)) return false
      if (locationFilter !== 'all' && !(c.location_tags ?? []).includes(locationFilter)) return false
      if (copyFilter !== 'all' && (c.copy_status || 'none') !== copyFilter) return false
      return true
    })
  }, [campaignsQuery.data?.campaigns, offerFilter, verticalFilter, locationFilter, copyFilter])

  return (
    <div className="rounded-2xl border border-stone-200/70 bg-white shadow-soft">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-neutral-900">Campaigns using copy</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Filter by offer × vertical × location × copy status
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={offerFilter}
            onChange={setOfferFilter}
            options={[
              { value: 'all', label: 'All offers' },
              ...offers.map((o) => ({ value: o.offer_key, label: o.name }))
            ]}
          />
          <Select
            value={verticalFilter}
            onChange={setVerticalFilter}
            options={[
              { value: 'all', label: 'All verticals' },
              ...VERTICAL_TAG_HINTS.map((t) => ({ value: t, label: t }))
            ]}
          />
          <Select
            value={locationFilter}
            onChange={setLocationFilter}
            options={[
              { value: 'all', label: 'All locations' },
              ...LOCATION_TAG_HINTS.map((t) => ({ value: t, label: t }))
            ]}
          />
          <Select
            value={copyFilter}
            onChange={setCopyFilter}
            options={[
              { value: 'all', label: 'All copy statuses' },
              ...['none', 'draft', 'ready', 'live'].map((s) => ({
                value: s,
                label: copyStatusLabel(s)
              }))
            ]}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-100 text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Campaign</th>
              <th className="px-3 py-3 font-medium">Offer</th>
              <th className="px-3 py-3 font-medium">Structure</th>
              <th className="px-3 py-3 font-medium">Vertical</th>
              <th className="px-3 py-3 font-medium">Location</th>
              <th className="px-3 py-3 font-medium">Copy</th>
              <th className="px-5 py-3 font-medium">Pipeline</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-neutral-500">
                  No campaigns match these filters.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-b border-stone-50 hover:bg-stone-50/60">
                  <td className="px-5 py-3">
                    <Link
                      href={`/sales/outbound/editor/${c.id}`}
                      className="font-medium text-neutral-900 hover:text-[#c2410c]"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-neutral-600">{c.offer_key || '—'}</td>
                  <td className="px-3 py-3 text-neutral-600">{c.structure_id || '—'}</td>
                  <td className="px-3 py-3 text-neutral-600">
                    {(c.vertical_tags ?? []).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-3 text-neutral-600">
                    {(c.location_tags ?? []).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        'rounded-xl px-2 py-0.5 text-[11px] font-medium',
                        c.copy_status === 'live'
                          ? 'bg-emerald-50 text-emerald-700'
                          : c.copy_status === 'ready'
                            ? 'bg-sky-50 text-sky-700'
                            : c.copy_status === 'draft'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-stone-100 text-neutral-500'
                      )}
                    >
                      {copyStatusLabel(c.copy_status || 'none')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-neutral-600">{c.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Select({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
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
  )
}
