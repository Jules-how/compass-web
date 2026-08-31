'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingBlock } from '@/components/LoadingBlock'
import {
  COMPONENT_GRAINS,
  COMPONENT_WINDOWS,
  type ComponentGrain,
  type ComponentStatRow,
  type ComponentWindow
} from '@/lib/component-stats'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

const GRAIN_LABELS: Record<ComponentGrain, string> = {
  vertical: 'Vertical',
  offer: 'Offer',
  opener_kind: 'Opener kind',
  cta: 'CTA type',
  subject: 'Subject (email 1)',
  length: 'Length band',
  research_kind: 'Research fact'
}

const MIN_DELIVERED = 200

type Payload = {
  rows: ComponentStatRow[]
  grain: ComponentGrain | null
  window: ComponentWindow | null
}

export function ComponentStatsBoard() {
  const [grain, setGrain] = useState<ComponentGrain>('offer')
  const [window, setWindow] = useState<ComponentWindow>('30d')

  const url = `/api/component-stats?grain=${encodeURIComponent(grain)}&window=${encodeURIComponent(window)}`
  const { data, loading } = useCachedJson<Payload>(url, url, { staleMs: 60_000 })

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Components</CardTitle>
            <CardDescription>
              Slice outbound performance by copy factor — sorted by meetings per 100 delivered
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="compass-input h-9 min-w-[8rem] px-3 text-sm"
              value={grain}
              onChange={(e) => setGrain(e.target.value as ComponentGrain)}
              aria-label="Grain"
            >
              {COMPONENT_GRAINS.map((g) => (
                <option key={g} value={g}>
                  {GRAIN_LABELS[g]}
                </option>
              ))}
            </select>
            <select
              className="compass-input h-9 min-w-[5rem] px-3 text-sm"
              value={window}
              onChange={(e) => setWindow(e.target.value as ComponentWindow)}
              aria-label="Window"
            >
              {COMPONENT_WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <LoadingBlock label="Loading component stats…" />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-stone-200/70 bg-stone-50/50 px-3.5 py-4 text-sm text-neutral-600">
            No stats for this slice yet. Run daily sync or backfill evidence first.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200/80 text-xs font-medium uppercase tracking-wide text-neutral-400">
                  <th className="py-2 pr-3">Key</th>
                  <th className="py-2 pr-3 text-right">Delivered</th>
                  <th className="py-2 pr-3 text-right">Positive %</th>
                  <th className="py-2 pr-3 text-right">Meetings / 100</th>
                  <th className="py-2 text-right">Campaigns</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const low = row.delivered < MIN_DELIVERED
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-stone-100/80 last:border-0"
                    >
                      <td className="py-2.5 pr-3 font-medium text-neutral-900">
                        <span className={cn(low && 'text-neutral-500')}>{row.key}</span>
                        {low ? (
                          <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-amber-700">
                            low n
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-neutral-700">
                        {row.delivered.toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-neutral-700">
                        {row.positive_rate}%
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums font-medium text-neutral-900">
                        {row.meetings_per_100}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-neutral-500">
                        {row.n_campaigns}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-neutral-500">
              Grains under {MIN_DELIVERED} delivered are marked low-confidence.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
