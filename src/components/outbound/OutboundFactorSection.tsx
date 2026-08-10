'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CompassCampaign } from '@/lib/campaigns'
import { listCampaigns } from '@/lib/campaigns-client'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import type { OutboundOffer } from '@/lib/outbound-copy'
import {
  enrichOutboundCampaignFactors,
  factorValue,
  rollupOutboundByFactor,
  type OutboundFactorCampaign,
  type OutboundFactorKey
} from '@/lib/outbound-factor-performance'
import {
  ensureOutboundLibrarySeeded,
  listLibraryItems
} from '@/lib/outbound-library-client'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

type OutboundBoardPayload = {
  live: OutboundBoardCampaign[]
  history: OutboundBoardCampaign[]
  liveCount: number
  source?: 'instantly' | 'demo' | 'error'
}

type Scope = 'all' | 'live' | 'history'

function Select({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </span>
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

export function OutboundFactorSection() {
  const board = useCachedJson<OutboundBoardPayload>(
    '/api/instantly/outbound-campaigns',
    '/api/instantly/outbound-campaigns',
    { staleMs: 60_000 }
  )
  const fromInstantly = board.data?.source === 'instantly'

  const [factor, setFactor] = useState<OutboundFactorKey>('offer')
  const [scope, setScope] = useState<Scope>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [pipeline, setPipeline] = useState<CompassCampaign[]>([])
  const [offers, setOffers] = useState<OutboundOffer[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        await ensureOutboundLibrarySeeded()
        const [cams, offerRows] = await Promise.all([
          listCampaigns(),
          listLibraryItems<OutboundOffer>('offers')
        ])
        if (cancelled) return
        setPipeline(cams)
        setOffers(offerRows)
      } catch {
        if (cancelled) return
        setPipeline([])
        setOffers([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const enriched = useMemo(() => {
    const live = board.data?.live ?? []
    const history = board.data?.history ?? []
    const offerNames = Object.fromEntries(offers.map((o) => [o.offer_key, o.name]))
    const all = [...live, ...history].map((c) =>
      enrichOutboundCampaignFactors(c, pipeline, offerNames)
    )
    return all
  }, [board.data, pipeline, offers])

  const scoped = useMemo(() => {
    if (scope === 'live') {
      return enriched.filter((c) => c.status === 'live' || c.status === 'launching' || c.status === 'paused')
    }
    if (scope === 'history') {
      return enriched.filter((c) => c.status === 'completed')
    }
    return enriched
  }, [enriched, scope])

  const rows = useMemo(() => rollupOutboundByFactor(scoped, factor), [scoped, factor])
  const maxReply = rows[0]?.replyRate || 1

  const selectedCampaigns: OutboundFactorCampaign[] = selected
    ? scoped.filter((c) => factorValue(c, factor) === selected)
    : []

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Performance by factor</CardTitle>
          <CardDescription>
            Instantly metrics rolled up by campaign bind — offer, CTA, length, audience
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
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Group by
            </span>
            <div className="inline-flex gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1">
              {(
                [
                  ['offer', 'Offer'],
                  ['cta', 'CTA'],
                  ['length', 'Length'],
                  ['audience', 'Audience']
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setFactor(key)
                    setSelected(null)
                  }}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition',
                    factor === key
                      ? 'bg-white text-neutral-900 shadow-soft'
                      : 'text-neutral-500 hover:text-neutral-800'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Select
            label="Status"
            value={scope}
            onChange={(v) => {
              setScope(v as Scope)
              setSelected(null)
            }}
            options={[
              { value: 'all', label: 'Live + History' },
              { value: 'live', label: 'Live only' },
              { value: 'history', label: 'History only' }
            ]}
          />
        </div>

        {board.loading && !board.data ? (
          <p className="text-sm text-neutral-500">Loading campaign metrics…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No campaigns to roll up yet. Bind offer / CTA / length on pipeline campaigns linked to
            Instantly to compare factors.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-100 text-[11px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-1 py-3 font-medium capitalize">{factor}</th>
                  <th className="px-3 py-3 font-medium">Campaigns</th>
                  <th className="px-3 py-3 font-medium">Sent</th>
                  <th className="px-3 py-3 font-medium">Reply %</th>
                  <th className="px-3 py-3 font-medium">Meetings</th>
                  <th className="px-3 py-3 font-medium">Opps</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const active = selected === row.key
                  return (
                    <tr
                      key={row.key}
                      onClick={() => setSelected(active ? null : row.key)}
                      className={cn(
                        'cursor-pointer border-b border-stone-50 transition',
                        active ? 'bg-orange-50/70' : 'hover:bg-stone-50/60'
                      )}
                    >
                      <td
                        className={cn(
                          'px-1 py-3',
                          active && 'border-l-[3px] border-l-[#e85d2a] pl-2'
                        )}
                      >
                        <div className="font-medium text-neutral-900">{row.key}</div>
                        {row.subtitle ? (
                          <div className="mt-0.5 text-[11px] text-neutral-400">{row.subtitle}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-neutral-600">{row.campaigns}</td>
                      <td className="px-3 py-3 tabular-nums text-neutral-600">
                        {row.sent.toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            'tabular-nums font-semibold',
                            row.replyRate === maxReply ? 'text-emerald-700' : 'text-neutral-800'
                          )}
                        >
                          {row.replyRate}%
                        </span>
                        <span className="ml-2 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-stone-100 align-middle">
                          <span
                            className="block h-full rounded-full bg-[#e85d2a]"
                            style={{
                              width: `${Math.max(8, (row.replyRate / maxReply) * 100)}%`
                            }}
                          />
                        </span>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-neutral-600">{row.meetings}</td>
                      <td className="px-3 py-3 tabular-nums text-neutral-600">
                        {row.opportunities}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {selected ? (
          <div className="rounded-2xl border border-stone-200/70 bg-stone-50/50 p-4">
            <div className="mb-3 flex items-end justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold text-neutral-900">
                  Campaigns using this {factor}
                </div>
                <div className="text-[12px] text-neutral-500">
                  {selected} · {selectedCampaigns.length} campaign
                  {selectedCampaigns.length === 1 ? '' : 's'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[12px] font-medium text-[#c2410c] hover:underline"
              >
                Clear
              </button>
            </div>
            <div className="space-y-2">
              {selectedCampaigns.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-stone-200/70 bg-white px-3.5 py-3"
                >
                  <div className="text-[13px] font-semibold text-neutral-900">{c.name}</div>
                  <div className="mt-0.5 text-[12px] text-neutral-500">
                    {[c.lengthBand, c.audience, c.status].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-neutral-500">
                    <span>
                      Sent <b className="font-semibold text-neutral-900">{c.sendCount}</b>
                    </span>
                    <span>
                      Reply <b className="font-semibold text-neutral-900">{c.replyRate}%</b>
                    </span>
                    <span>
                      Opps <b className="font-semibold text-neutral-900">{c.opportunities}</b>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : rows.length > 0 ? (
          <p className="text-[12px] text-neutral-500">
            Click a row to see matching campaigns. Factors come from pipeline copy binds when linked
            to Instantly; otherwise offer is parsed from the campaign name.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
