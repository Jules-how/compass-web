'use client'

import { useMemo } from 'react'
import type { CompassMetaAdSet } from '@/lib/types'
import {
  buildLocationHeatmap,
  locationHeatFill,
  locationHeatTextClass,
  type LocationHeatStatus
} from '@/lib/location-heatmap'

const STATUS_LABEL: Record<LocationHeatStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  draft: 'Draft',
  archived: 'Archived'
}

export function LocationTargetingHeatmap({ adSets }: { adSets: CompassMetaAdSet[] }) {
  const model = useMemo(
    () =>
      buildLocationHeatmap(
        adSets.map((row) => ({ locations: row.locations, status: row.status })),
        { limit: 10 }
      ),
    [adSets]
  )

  if (adSets.length === 0) {
    return null
  }

  if (model.rows.length === 0) {
    return (
      <div className="compass-panel px-4 py-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
          Location heatmap
        </div>
        <p className="mt-2 text-sm text-neutral-600">
          No location targeting yet. Add locations on ad sets to see which markets you target most.
        </p>
      </div>
    )
  }

  return (
    <div className="compass-panel overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
            Location heatmap
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            Where you target most across {model.adSetsWithLocations} ad set
            {model.adSetsWithLocations === 1 ? '' : 's'}
            {model.adSetsMissingLocations > 0
              ? ` · ${model.adSetsMissingLocations} without locations`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
          <span>Less</span>
          <div className="flex h-2.5 overflow-hidden rounded-sm">
            {[0.15, 0.35, 0.55, 0.75, 1].map((t) => (
              <span
                key={t}
                className="h-full w-4"
                style={{ background: locationHeatFill(t) }}
                aria-hidden
              />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto px-4 py-4">
        <table className="w-full min-w-[520px] border-separate border-spacing-1.5">
          <thead>
            <tr>
              <th className="pb-1 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
                Location
              </th>
              {model.statuses.map((status) => (
                <th
                  key={status}
                  className="pb-1 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400"
                >
                  {STATUS_LABEL[status]}
                </th>
              ))}
              <th className="pb-1 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
              <tr key={row.key}>
                <td className="max-w-[220px] truncate py-0.5 pr-2 text-sm font-medium text-neutral-900">
                  {row.label}
                </td>
                {model.statuses.map((status) => {
                  const count = row.byStatus[status]
                  const cellIntensity =
                    model.maxTotal > 0 ? count / model.maxTotal : 0
                  return (
                    <td key={status} className="p-0">
                      <div
                        title={`${row.label} · ${STATUS_LABEL[status]}: ${count}`}
                        className={`flex h-9 items-center justify-center rounded-md text-xs font-semibold tabular-nums transition ${
                          count > 0 ? locationHeatTextClass(cellIntensity) : 'text-neutral-300'
                        }`}
                        style={{
                          background:
                            count > 0 ? locationHeatFill(cellIntensity) : 'rgb(250 250 249)'
                        }}
                      >
                        {count > 0 ? count : '·'}
                      </div>
                    </td>
                  )
                })}
                <td className="pl-2 text-right">
                  <div
                    className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-2 py-1.5 text-xs font-semibold tabular-nums ${locationHeatTextClass(
                      row.intensity
                    )}`}
                    style={{ background: locationHeatFill(row.intensity) }}
                  >
                    {row.total}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {model.uniqueLocations > model.rows.length ? (
        <div className="border-t border-stone-100 px-4 py-2.5 text-xs text-neutral-500">
          Showing top {model.rows.length} of {model.uniqueLocations} locations
        </div>
      ) : null}
    </div>
  )
}
