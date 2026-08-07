'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useTimelineWheelZoom } from '@/hooks/useTimelineWheelZoom'
import type { CompassProjectWithStats } from '@/lib/types'
import {
  ZOOM_OPTIONS,
  buildHeaderModel,
  buildTimelineRange,
  dateToX,
  formatHoverDate,
  parseDateOnly,
  pxPerDay,
  xToDate,
  type TimelineZoom
} from '@/lib/campaign-timeline'
import {
  formatProjectDate,
  normalizeProjectStatus,
  projectHealthLabel,
  projectPriorityLabel,
  projectStatusLabel
} from '@/lib/project-pm'

const ROW_HEIGHT = 48
const LABEL_WIDTH = 300
const EMPTY_ROWS = 10
const HEADER_HEIGHT = 52
const TODAY_PURPLE = '#5e6ad2'

const PROJECT_ICON_COLORS = [
  '#5e6ad2',
  '#26b5ce',
  '#4cb782',
  '#f2c94c',
  '#f2994a',
  '#eb5757',
  '#bb87fc',
  '#95a2b3',
  '#e67e22',
  '#3498db'
]

function projectAccent(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return PROJECT_ICON_COLORS[hash % PROJECT_ICON_COLORS.length]
}

function statusDotClass(status: string): string {
  switch (normalizeProjectStatus(status)) {
    case 'in_progress':
      return 'border-[#f2c94c] bg-[#f2c94c]/30'
    case 'planned':
      return 'border-[#5e6ad2] bg-[#5e6ad2]/20'
    case 'completed':
      return 'border-emerald-500 bg-emerald-500'
    case 'canceled':
      return 'border-neutral-300 bg-neutral-200'
    default:
      return 'border-neutral-300 bg-transparent'
  }
}

function healthIcon(health: string): { className: string; title: string } {
  switch (health) {
    case 'on_track':
      return { className: 'text-emerald-500', title: projectHealthLabel(health) }
    case 'at_risk':
      return { className: 'text-amber-500', title: projectHealthLabel(health) }
    case 'off_track':
      return { className: 'text-red-500', title: projectHealthLabel(health) }
    default:
      return { className: 'text-amber-400', title: 'Update missing' }
  }
}

export function ProjectTimeline({
  projects,
  clientById,
  zoom,
  onZoomChange
}: {
  projects: CompassProjectWithStats[]
  clientById: Record<string, { id: string; name: string }>
  zoom: TimelineZoom
  onZoomChange: (zoom: TimelineZoom) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const didCenterToday = useRef(false)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)

  const range = useMemo(
    () =>
      buildTimelineRange(
        projects.flatMap((project) => [project.start_date, project.target_date]),
        zoom
      ),
    [projects, zoom]
  )

  const header = useMemo(() => buildHeaderModel(range, zoom, true), [range, zoom])
  const todayX = dateToX(range.today, range, zoom)
  const gridHeight = Math.max(projects.length, EMPTY_ROWS) * ROW_HEIGHT

  const scrollToToday = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const el = scrollRef.current
      if (!el) return
      el.scrollTo({ left: Math.max(0, todayX - el.clientWidth * 0.35), behavior })
    },
    [todayX]
  )

  useEffect(() => {
    if (didCenterToday.current) return
    scrollToToday('auto')
    didCenterToday.current = true
  }, [scrollToToday])

  useTimelineWheelZoom({
    scrollRef,
    zoom,
    range,
    labelWidth: LABEL_WIDTH,
    onZoomChange,
    onBeforeZoom: () => {
      didCenterToday.current = true
    }
  })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.target instanceof HTMLSelectElement) return
      const key = e.key.toLowerCase()
      if (key === 't') scrollToToday('smooth')
      if (key === 'y' || key === 'q' || key === 'm' || key === 'w') {
        didCenterToday.current = false
        onZoomChange(key === 'y' ? 'year' : key === 'q' ? 'quarter' : key === 'm' ? 'month' : 'week')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onZoomChange, scrollToToday])

  function onTimelineMouseMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0) - LABEL_WIDTH
    if (x < 0) {
      setHoverDate(null)
      setHoverX(null)
      return
    }
    setHoverX(x)
    setHoverDate(xToDate(x, range, zoom))
  }

  return (
    <div className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-neutral-200/80 bg-[#f7f8f9]">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-neutral-200/80 bg-white px-3">
        <div className="text-[12px] text-neutral-500">
          <span className="font-medium text-neutral-700">{projects.length}</span> project
          {projects.length === 1 ? '' : 's'}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollToToday('smooth')}
            className="h-7 rounded-md border border-neutral-200 bg-white px-2.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Today
          </button>
          <label className="relative">
            <select
              value={zoom}
              onChange={(e) => {
                didCenterToday.current = false
                onZoomChange(e.target.value as TimelineZoom)
              }}
              className="h-7 appearance-none rounded-md border border-neutral-200 bg-white py-0 pl-2.5 pr-7 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
            >
              {ZOOM_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400">
              ▾
            </span>
          </label>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative"
          style={{ minWidth: LABEL_WIDTH + range.widthPx, minHeight: '100%' }}
          onMouseMove={onTimelineMouseMove}
          onMouseLeave={() => {
            setHoverDate(null)
            setHoverX(null)
          }}
        >
          <div
            className="sticky top-0 z-30 flex border-b border-neutral-200/80 bg-[#f7f8f9]"
            style={{ height: HEADER_HEIGHT }}
          >
            <div
              className="sticky left-0 z-40 flex items-end border-r border-neutral-200/80 bg-[#f7f8f9] px-3 pb-2 text-[12px] font-medium text-neutral-500"
              style={{ width: LABEL_WIDTH }}
            >
              Projects
              <span className="ml-2 tabular-nums text-neutral-400">{projects.length}</span>
            </div>
            <div className="relative" style={{ width: range.widthPx, height: HEADER_HEIGHT }}>
              {header.weekends.map((band) => (
                <div
                  key={band.key}
                  className="absolute bottom-0 top-0 bg-neutral-200/40"
                  style={{ left: band.x, width: band.width }}
                />
              ))}
              {header.primary.map((tick) => (
                <div
                  key={tick.key}
                  className="absolute top-0 border-l border-neutral-200/80"
                  style={{ left: tick.x, width: Math.max(tick.width, 1), height: 24 }}
                >
                  <div className="truncate px-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-neutral-500">
                    {tick.label}
                  </div>
                </div>
              ))}
              {header.secondary.map((tick) => (
                <div
                  key={tick.key}
                  className="absolute bottom-0 border-l border-neutral-200/50"
                  style={{ left: tick.x, width: Math.max(tick.width, 1), height: 26 }}
                >
                  <div className="px-1 text-[10px] tabular-nums text-neutral-400">{tick.label}</div>
                </div>
              ))}
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10"
                style={{
                  left: todayX,
                  width: Math.max(pxPerDay(zoom), 2),
                  background: `${TODAY_PURPLE}26`
                }}
              >
                <div className="absolute inset-y-0 left-0 w-px" style={{ background: TODAY_PURPLE }} />
                <span
                  className="absolute left-1/2 top-1 z-20 -translate-x-1/2 whitespace-nowrap rounded-[4px] px-1.5 py-[2px] text-[10px] font-semibold text-white"
                  style={{ background: TODAY_PURPLE }}
                >
                  {range.today
                    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    .toUpperCase()}
                </span>
              </div>
              {hoverDate && hoverX !== null ? (
                <div className="pointer-events-none absolute bottom-0 top-0 z-20" style={{ left: hoverX }}>
                  <div className="absolute inset-y-0 w-px bg-neutral-400/50" />
                  <span className="absolute left-1/2 top-1 z-30 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-white">
                    {formatHoverDate(hoverDate)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="relative" style={{ minHeight: gridHeight }}>
            <div
              className="pointer-events-none absolute bottom-0 top-0"
              style={{ left: LABEL_WIDTH, width: range.widthPx }}
            >
              {header.weekends.map((band) => (
                <div
                  key={`body-we-${band.key}`}
                  className="absolute bottom-0 top-0 bg-neutral-200/25"
                  style={{ left: band.x, width: band.width }}
                />
              ))}
              {header.primary.map((tick) => (
                <div
                  key={`body-${tick.key}`}
                  className="absolute bottom-0 top-0 border-l border-neutral-200/60"
                  style={{ left: tick.x }}
                />
              ))}
              <div
                className="absolute bottom-0 top-0"
                style={{
                  left: todayX,
                  width: Math.max(pxPerDay(zoom), 2),
                  background: `${TODAY_PURPLE}1a`
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 w-px"
                  style={{ background: `${TODAY_PURPLE}80` }}
                />
              </div>
            </div>

            {projects.map((project) => {
              const start = parseDateOnly(project.start_date)
              const end = parseDateOnly(project.target_date)
              const accent = projectAccent(project.id)
              const health = healthIcon(project.health || 'no_updates')
              const clientName =
                project.client_name ||
                (project.client_id ? clientById[project.client_id]?.name : null)

              let left = 0
              let width = 40
              if (start && end) {
                left = dateToX(start, range, zoom)
                width = Math.max(28, dateToX(end, range, zoom) + pxPerDay(zoom) - left)
              } else if (start) {
                left = dateToX(start, range, zoom)
                width = Math.max(28, pxPerDay(zoom) * 14)
              } else if (end) {
                left = Math.max(0, dateToX(end, range, zoom) - pxPerDay(zoom) * 14)
                width = Math.max(28, pxPerDay(zoom) * 14)
              }

              const hasDates = Boolean(start || end)

              return (
                <div
                  key={project.id}
                  className="group relative flex border-b border-neutral-100 hover:bg-white/90"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div
                    className="sticky left-0 z-20 flex items-center gap-2 border-r border-neutral-200/80 bg-inherit px-3"
                    style={{ width: LABEL_WIDTH }}
                  >
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      title={project.name}
                    >
                      <ProjectIcon color={accent} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-800">
                        {project.name}
                      </span>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5 text-neutral-400">
                      <span
                        className={`h-3 w-3 rounded-full border-2 ${statusDotClass(project.status)}`}
                        title={projectStatusLabel(project.status)}
                      />
                      <span className={health.className} title={health.title}>
                        <HealthGlyph health={project.health || 'no_updates'} />
                      </span>
                      <span
                        className="hidden text-[10px] text-neutral-400 sm:inline"
                        title={projectPriorityLabel(project.priority)}
                      >
                        <PriorityBars priority={project.priority} />
                      </span>
                      {clientName ? (
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-semibold text-neutral-600"
                          title={clientName}
                        >
                          {clientName
                            .split(/\s+/)
                            .map((part) => part[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-neutral-300 text-[9px] text-neutral-400">
                          —
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="relative" style={{ width: range.widthPx }}>
                    {hasDates ? (
                      <Link
                        href={`/projects/${project.id}`}
                        className="absolute block"
                        style={{ left, width: Math.max(width, 88), top: 6, height: ROW_HEIGHT - 10 }}
                        title={`${formatProjectDate(project.start_date)} → ${formatProjectDate(project.target_date)}`}
                      >
                        <span className="mb-1 block truncate pr-1 text-[11px] font-medium leading-none text-neutral-700">
                          {project.name}
                        </span>
                        <span
                          className="relative block h-[20px] overflow-hidden rounded-[6px] border border-neutral-300 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition group-hover:border-neutral-400"
                          style={{ width }}
                        >
                          <span
                            className="absolute inset-y-0 left-0 w-[3px] rounded-l-[5px]"
                            style={{ background: accent }}
                          />
                          {project.stats?.percentComplete > 0 ? (
                            <span
                              className="absolute inset-y-0 left-[3px] opacity-20"
                              style={{
                                width: `${Math.min(100, project.stats.percentComplete)}%`,
                                background: accent
                              }}
                            />
                          ) : null}
                        </span>
                      </Link>
                    ) : (
                      <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400">
                          No dates
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {Array.from({ length: Math.max(0, EMPTY_ROWS - projects.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex border-b border-neutral-100/70"
                style={{ height: ROW_HEIGHT }}
              >
                <div
                  className="sticky left-0 z-20 border-r border-neutral-200/80 bg-[#f7f8f9]"
                  style={{ width: LABEL_WIDTH }}
                />
                <div style={{ width: range.widthPx }} />
              </div>
            ))}

            {projects.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-xl border border-neutral-200 bg-white/95 px-5 py-4 text-center shadow-sm backdrop-blur">
                  <p className="text-sm font-medium text-neutral-800">No projects on the timeline</p>
                  <p className="mt-1 max-w-xs text-xs text-neutral-500">
                    Add start and target dates to place projects on the roadmap.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function ProjectIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        d="M8 1.2 13.5 4.3v7.4L8 14.8 2.5 11.7V4.3L8 1.2Z"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.2"
      />
      <path d="M8 4.2 11.2 6v4L8 11.8 4.8 10V6L8 4.2Z" fill={color} />
    </svg>
  )
}

function HealthGlyph({ health }: { health: string }) {
  if (health === 'on_track') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 10.5 6.5 7l2.5 2.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (health === 'at_risk' || health === 'off_track') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="8" cy="8" r="5.2" />
        <path d="M8 5.2v3.4" strokeLinecap="round" />
        <circle cx="8" cy="11" r="0.7" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8" cy="8" r="5.2" strokeDasharray="2.2 2" />
      <path d="M8 5v3.2l2 1.2" strokeLinecap="round" />
    </svg>
  )
}

function PriorityBars({ priority }: { priority: number }) {
  const filled = priority === 0 ? 0 : priority === 1 ? 3 : priority === 2 ? 3 : priority === 3 ? 2 : 1
  return (
    <span className="inline-flex h-3.5 w-3.5 items-end gap-[1px]">
      {[1, 2, 3].map((level) => (
        <span
          key={level}
          className={`w-[3px] rounded-sm ${level <= filled ? 'bg-neutral-500' : 'bg-neutral-200'}`}
          style={{ height: 4 + level * 3 }}
        />
      ))}
    </span>
  )
}
