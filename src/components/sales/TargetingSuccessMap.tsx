'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { LoadingBlock } from '@/components/LoadingBlock'
import {
  AUSTRALIA_MAP_VIEW,
  AUSTRALIA_OUTLINE_PATHS,
  isInAustraliaBounds,
  projectAustraliaLatLng
} from '@/lib/australia-outline'
import {
  buildDemoTargetingMap,
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
  const min = 8
  const max = 28
  if (maxTargeted <= 0) return min
  const t = Math.sqrt(point.targeted / maxTargeted)
  return min + t * (max - min)
}

function formatPct(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

function shortLabel(label: string): string {
  const city = label.split(',')[0]?.trim() || label
  return city.length > 16 ? `${city.slice(0, 14)}…` : city
}

/** Greedy label placement — keep the highest-volume AU pins readable. */
function labeledKeys(points: TargetingMapPoint[], limit = 7): Set<string> {
  const keys = new Set<string>()
  const placed: Array<{ x: number; y: number }> = []
  for (const point of points) {
    if (keys.size >= limit) break
    if (point.lat == null || point.lng == null) continue
    if (!isInAustraliaBounds(point.lat, point.lng)) continue
    const { x, y } = projectAustraliaLatLng(point.lat, point.lng)
    const colliding = placed.some((p) => Math.hypot(p.x - x, p.y - y) < 48)
    if (colliding) continue
    placed.push({ x, y })
    keys.add(point.key)
  }
  return keys
}

export function TargetingSuccessMap() {
  const { data, error, loading } = useCachedJson<TargetingMapPayload>(
    '/api/leads/targeting-map',
    '/api/leads/targeting-map',
    { staleMs: 60_000 }
  )

  const model = useMemo(() => data ?? buildDemoTargetingMap(), [data])
  const mapped = useMemo(
    () =>
      model.points.filter(
        (p) => p.lat != null && p.lng != null && isInAustraliaBounds(p.lat, p.lng)
      ),
    [model.points]
  )
  const outsideAustralia = useMemo(
    () =>
      model.points.filter(
        (p) => p.lat != null && p.lng != null && !isInAustraliaBounds(p.lat, p.lng)
      ),
    [model.points]
  )
  const unmapped = useMemo(
    () => model.points.filter((p) => p.lat == null || p.lng == null),
    [model.points]
  )
  const maxTargeted = useMemo(
    () => Math.max(1, ...mapped.map((p) => p.targeted), 1),
    [mapped]
  )
  const labels = useMemo(() => labeledKeys(mapped), [mapped])

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
            Lead locations from your CRM across Australia. Marker size is how many people
            you&apos;ve targeted; colour heat is where replies and wins (interested / booked /
            converted) concentrate.
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
        <div className="relative min-h-[360px] bg-[radial-gradient(ellipse_at_30%_20%,rgba(232,93,42,0.07),transparent_45%),radial-gradient(ellipse_at_80%_70%,rgba(15,23,42,0.05),transparent_50%),linear-gradient(180deg,#f4f7fa_0%,#e8eef3_100%)] p-3 sm:p-4">
          <svg
            viewBox={`0 0 ${AUSTRALIA_MAP_VIEW.width} ${AUSTRALIA_MAP_VIEW.height}`}
            className="h-auto w-full"
            role="img"
            aria-label="Map of Australia with targeted lead locations"
          >
            <defs>
              <filter id="pin-soft" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodOpacity="0.18" />
              </filter>
              <linearGradient id="aus-land" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f5f0e8" />
                <stop offset="100%" stopColor="#e7e0d4" />
              </linearGradient>
            </defs>

            {/* Soft ocean wash */}
            <rect
              x="0"
              y="0"
              width={AUSTRALIA_MAP_VIEW.width}
              height={AUSTRALIA_MAP_VIEW.height}
              fill="#dbe4ec"
              opacity="0.35"
            />

            {AUSTRALIA_OUTLINE_PATHS.map((d, index) => (
              <path
                key={`aus-${index}`}
                d={d}
                fill="url(#aus-land)"
                stroke="#a8a29e"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            ))}

            {mapped.map((point) => {
              const { x, y } = projectAustraliaLatLng(point.lat!, point.lng!)
              const r = markerRadius(point, maxTargeted)
              const showLabel = labels.has(point.key)
              return (
                <g key={point.key} filter="url(#pin-soft)" className="cursor-default">
                  <title>
                    {`${point.label}: ${point.targeted} targeted · ${point.successes} wins · ${formatPct(point.successRate)} success`}
                  </title>
                  <circle
                    cx={x}
                    cy={y}
                    r={r + 5}
                    fill={targetingHeatFill(Math.max(0.2, point.heat * 0.45))}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill={targetingHeatFill(point.heat)}
                    stroke="#fff"
                    strokeWidth="1.75"
                  />
                  {showLabel ? (
                    <text
                      x={x}
                      y={y + r + 16}
                      textAnchor="middle"
                      className="fill-neutral-700"
                      style={{ fontSize: 13, fontWeight: 600 }}
                    >
                      {shortLabel(point.label)}
                    </text>
                  ) : null}
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
          <ol className="max-h-[460px] divide-y divide-stone-100 overflow-y-auto">
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
          {outsideAustralia.length > 0 ? (
            <div className="border-t border-stone-100 px-4 py-2.5 text-xs text-neutral-500">
              {outsideAustralia.length} location{outsideAustralia.length === 1 ? '' : 's'} outside
              Australia listed in the ranking only.
            </div>
          ) : null}
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
