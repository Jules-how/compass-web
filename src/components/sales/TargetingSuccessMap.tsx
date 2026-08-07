'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { LoadingBlock } from '@/components/LoadingBlock'
import {
  buildDemoTargetingMap,
  projectLatLng,
  targetingHeatFill,
  type TargetingMapModel,
  type TargetingMapPoint
} from '@/lib/targeting-map'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

type TargetingMapPayload = TargetingMapModel & {
  warning?: string
  error?: string
}

function markerRadius(point: TargetingMapPoint, maxTargeted: number): number {
  const min = 7
  const max = 26
  if (maxTargeted <= 0) return min
  const t = Math.sqrt(point.targeted / maxTargeted)
  return min + t * (max - min)
}

function formatPct(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

export function TargetingSuccessMap() {
  const { data, error, loading } = useCachedJson<TargetingMapPayload>(
    '/api/leads/targeting-map',
    '/api/leads/targeting-map',
    { staleMs: 60_000 }
  )

  const model = useMemo(() => data ?? buildDemoTargetingMap(), [data])
  const mapped = useMemo(() => model.points.filter((p) => p.lat != null && p.lng != null), [model.points])
  const unmapped = useMemo(() => model.points.filter((p) => p.lat == null || p.lng == null), [model.points])
  const maxTargeted = useMemo(
    () => Math.max(1, ...model.points.map((p) => p.targeted)),
    [model.points]
  )

  if (loading && !data) {
    return <LoadingBlock label="Loading targeting map…" />
  }

  return (
    <section className="compass-panel overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 px-4 py-3.5 sm:px-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
            Targeting map
          </div>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-neutral-900">
            Where you target — and where it works
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">
            Lead locations from your CRM. Marker size is how many people you&apos;ve targeted;
            colour heat is where interested / booked / converted outcomes concentrate.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
          <span className="rounded-md bg-stone-100 px-2 py-1 tabular-nums text-neutral-700">
            {model.totals.targeted.toLocaleString()} located
          </span>
          <span className="rounded-md bg-stone-100 px-2 py-1 tabular-nums text-neutral-700">
            {model.totals.successes.toLocaleString()} wins
          </span>
          <span className="rounded-md bg-stone-100 px-2 py-1 tabular-nums text-neutral-700">
            {formatPct(model.totals.successRate)} success
          </span>
          {model.source === 'demo' ? (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
              Demo sample
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="border-b border-amber-100 bg-amber-50/70 px-4 py-2 text-sm text-amber-900 sm:px-5">
          Couldn&apos;t refresh live lead locations — showing the last available map.
        </div>
      ) : null}

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)]">
        <div className="relative min-h-[320px] bg-[radial-gradient(ellipse_at_30%_20%,rgba(232,93,42,0.08),transparent_45%),radial-gradient(ellipse_at_80%_70%,rgba(15,23,42,0.06),transparent_50%),linear-gradient(180deg,#f8f7f4_0%,#efece7_100%)] p-3 sm:p-4">
          <svg
            viewBox="0 0 1000 520"
            className="h-auto w-full"
            role="img"
            aria-label="Map of targeted lead locations"
          >
            <defs>
              <filter id="pin-soft" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodOpacity="0.18" />
              </filter>
            </defs>

            {/* Soft landmass bands — equirectangular silhouette cues, not a full atlas. */}
            <ellipse cx="180" cy="210" rx="70" ry="110" fill="#d6d3d1" opacity="0.35" />
            <ellipse cx="250" cy="160" rx="90" ry="70" fill="#d6d3d1" opacity="0.28" />
            <ellipse cx="470" cy="170" rx="55" ry="75" fill="#d6d3d1" opacity="0.3" />
            <ellipse cx="520" cy="250" rx="40" ry="70" fill="#d6d3d1" opacity="0.25" />
            <ellipse cx="780" cy="300" rx="55" ry="50" fill="#d6d3d1" opacity="0.32" />
            <ellipse cx="860" cy="360" rx="70" ry="55" fill="#d6d3d1" opacity="0.4" />
            <ellipse cx="820" cy="180" rx="35" ry="45" fill="#d6d3d1" opacity="0.22" />

            <g stroke="#a8a29e" strokeOpacity="0.25" strokeWidth="1" fill="none">
              <path d="M0 260 H1000" />
              <path d="M500 0 V520" />
            </g>

            {mapped.map((point) => {
              const { x, y } = projectLatLng(point.lat!, point.lng!)
              const r = markerRadius(point, maxTargeted)
              return (
                <g key={point.key} filter="url(#pin-soft)" className="cursor-default">
                  <title>
                    {`${point.label}: ${point.targeted} targeted · ${point.successes} wins · ${formatPct(point.successRate)} success`}
                  </title>
                  <circle
                    cx={x}
                    cy={y}
                    r={r + 4}
                    fill={targetingHeatFill(Math.max(0.2, point.heat * 0.45))}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill={targetingHeatFill(point.heat)}
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                  <text
                    x={x}
                    y={y + r + 14}
                    textAnchor="middle"
                    className="fill-neutral-700"
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {point.label.split(',')[0]}
                  </text>
                </g>
              )
            })}
          </svg>

          <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-stone-200/80 bg-white/90 px-2.5 py-1.5 text-[11px] text-neutral-600 shadow-sm backdrop-blur">
            <span>Less success</span>
            <span className="flex h-2.5 overflow-hidden rounded-sm">
              {[0.15, 0.35, 0.55, 0.75, 1].map((t) => (
                <span key={t} className="h-full w-3.5" style={{ background: targetingHeatFill(t) }} />
              ))}
            </span>
            <span>More success</span>
          </div>
        </div>

        <div className="border-t border-stone-100 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
              Top locations
            </div>
            <Link href="/leads" className="text-xs font-medium text-[#c2410c] hover:underline">
              Open CRM
            </Link>
          </div>
          <ol className="max-h-[420px] divide-y divide-stone-100 overflow-y-auto">
            {model.points.slice(0, 12).map((point, index) => (
              <li key={point.key} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold tabular-nums text-neutral-400">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate font-medium text-neutral-900">{point.label}</div>
                    <div
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                        point.successRate >= 0.12 ? 'text-white' : 'text-neutral-800'
                      )}
                      style={{ background: targetingHeatFill(Math.max(0.25, point.heat)) }}
                    >
                      {formatPct(point.successRate)}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                    <span>
                      <span className="font-medium text-neutral-800">{point.targeted}</span> targeted
                    </span>
                    <span>
                      <span className="font-medium text-neutral-800">{point.successes}</span> wins
                    </span>
                    <span>
                      <span className="font-medium text-neutral-800">{point.replies}</span> replies+
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(6, point.heat * 100)}%`,
                        background: targetingHeatFill(Math.max(0.35, point.heat))
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {unmapped.length > 0 ? (
            <div className="border-t border-stone-100 px-4 py-2.5 text-xs text-neutral-500">
              {unmapped.length} location{unmapped.length === 1 ? '' : 's'} listed without map pins
              (unknown city/region).
            </div>
          ) : null}
          {model.totals.missingLocation > 0 ? (
            <div className="border-t border-stone-100 px-4 py-2.5 text-xs text-neutral-500">
              {model.totals.missingLocation.toLocaleString()} leads have no city/state yet.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
