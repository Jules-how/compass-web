'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CampaignSidecar } from '@/components/campaigns/CampaignSidecar'
import {
  campaignStatusLabel,
  formatCampaignDate,
  type CompassCampaign
} from '@/lib/campaigns'
import {
  ZOOM_OPTIONS,
  buildHeaderTicks,
  buildTimelineRange,
  clampDateOrder,
  dateToX,
  parseDateOnly,
  pxPerDay,
  toDateOnly,
  type TimelineZoom
} from '@/lib/campaign-timeline'

const ROW_HEIGHT = 52
const LABEL_WIDTH = 220

type DragMode = 'move' | 'resize-start' | 'resize-end'

type DragState = {
  id: string
  mode: DragMode
  originX: number
  start: string
  end: string
}

export function CampaignPlanner() {
  const [campaigns, setCampaigns] = useState<CompassCampaign[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState<TimelineZoom>('year')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [draftDates, setDraftDates] = useState<Record<string, { start: string; end: string }>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const didCenterToday = useRef(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/campaigns', { headers: { Accept: 'application/json' } })
      const body = await res.json()
      if (!res.ok) throw new Error(body.detail || body.error || 'fetch_failed')
      setCampaigns((body.campaigns ?? []) as CompassCampaign[])
    } catch (err) {
      setCampaigns([])
      setError(err instanceof Error ? err.message : 'fetch_failed')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const range = useMemo(() => {
    const rows = campaigns ?? []
    return buildTimelineRange(
      rows.flatMap((c) => [
        draftDates[c.id]?.start ?? c.start_date,
        draftDates[c.id]?.end ?? c.end_date
      ]),
      zoom
    )
  }, [campaigns, draftDates, zoom])

  const ticks = useMemo(() => buildHeaderTicks(range, zoom), [range, zoom])
  const todayX = dateToX(range.today, range, zoom)

  const scrollToToday = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const target = Math.max(0, todayX - el.clientWidth * 0.35)
    el.scrollTo({ left: target, behavior: 'smooth' })
  }, [todayX])

  useEffect(() => {
    if (!campaigns || didCenterToday.current) return
    const el = scrollRef.current
    if (!el) return
    const target = Math.max(0, todayX - el.clientWidth * 0.35)
    el.scrollLeft = target
    didCenterToday.current = true
  }, [campaigns, todayX])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.target instanceof HTMLSelectElement) return
      const key = e.key.toLowerCase()
      if (key === 'escape') setSelectedId(null)
      if (key === 'y') setZoom('year')
      if (key === 'q') setZoom('quarter')
      if (key === 'm') setZoom('month')
      if (key === 'w') setZoom('week')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function createCampaign() {
    setCreating(true)
    setError(null)
    try {
      const today = toDateOnly(range.today)
      const end = toDateOnly(
        new Date(range.today.getFullYear(), range.today.getMonth() + 1, range.today.getDate())
      )
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: 'New campaign',
          status: 'planned',
          start_date: today,
          end_date: end,
          color: '#f97316'
        })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.detail || body.error || 'create_failed')
      const campaign = body as CompassCampaign
      setCampaigns((rows) => [...(rows ?? []), campaign])
      setSelectedId(campaign.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create_failed')
    } finally {
      setCreating(false)
    }
  }

  async function persistDates(id: string, start: string, end: string) {
    const ordered = clampDateOrder(start, end)
    setCampaigns((rows) =>
      (rows ?? []).map((row) =>
        row.id === id
          ? { ...row, start_date: ordered.start, end_date: ordered.end }
          : row
      )
    )
    setDraftDates((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ start_date: ordered.start, end_date: ordered.end })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.detail || body.error || 'update_failed')
      setCampaigns((rows) =>
        (rows ?? []).map((row) => (row.id === id ? (body as CompassCampaign) : row))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'update_failed')
      void load()
    }
  }

  function onPointerDownBar(
    e: ReactPointerEvent,
    campaign: CompassCampaign,
    mode: DragMode
  ) {
    e.preventDefault()
    e.stopPropagation()
    const start = draftDates[campaign.id]?.start ?? campaign.start_date
    const end = draftDates[campaign.id]?.end ?? campaign.end_date
    if (!start || !end) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setSelectedId(campaign.id)
    setDrag({
      id: campaign.id,
      mode,
      originX: e.clientX,
      start,
      end
    })
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!drag) return
    const deltaDays = Math.round((e.clientX - drag.originX) / pxPerDay(zoom))
    const startDate = parseDateOnly(drag.start)
    const endDate = parseDateOnly(drag.end)
    if (!startDate || !endDate) return

    let nextStart = startDate
    let nextEnd = endDate
    if (drag.mode === 'move') {
      nextStart = new Date(startDate)
      nextEnd = new Date(endDate)
      nextStart.setDate(nextStart.getDate() + deltaDays)
      nextEnd.setDate(nextEnd.getDate() + deltaDays)
    } else if (drag.mode === 'resize-start') {
      nextStart = new Date(startDate)
      nextStart.setDate(nextStart.getDate() + deltaDays)
      if (nextStart > endDate) nextStart = new Date(endDate)
    } else {
      nextEnd = new Date(endDate)
      nextEnd.setDate(nextEnd.getDate() + deltaDays)
      if (nextEnd < startDate) nextEnd = new Date(startDate)
    }

    setDraftDates((prev) => ({
      ...prev,
      [drag.id]: { start: toDateOnly(nextStart), end: toDateOnly(nextEnd) }
    }))
  }

  function onPointerUp() {
    if (!drag) return
    const draft = draftDates[drag.id]
    const start = draft?.start ?? drag.start
    const end = draft?.end ?? drag.end
    setDrag(null)
    if (start !== drag.start || end !== drag.end) {
      void persistDates(drag.id, start, end)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f7f7f8]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Campaign Planner</h1>
          <p className="text-xs text-neutral-500">Sales · Pipeline · cold email timeline</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={scrollToToday}
            className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            Today
          </button>
          <label className="relative">
            <select
              value={zoom}
              onChange={(e) => {
                didCenterToday.current = false
                setZoom(e.target.value as TimelineZoom)
              }}
              className="appearance-none rounded-full border border-neutral-200 bg-white py-1.5 pl-3 pr-7 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
            >
              {ZOOM_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400">
              ▾
            </span>
          </label>
          <button
            type="button"
            disabled={creating}
            onClick={() => void createCampaign()}
            className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            + New
          </button>
        </div>
      </header>

      {error ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {error}
          {error.includes('does not exist') || error.includes('schema cache') ? (
            <span>
              {' '}
              Apply migration <code>0028_compass_pipeline_campaigns.sql</code> to enable persistence.
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            <div className="relative" style={{ minWidth: LABEL_WIDTH + range.widthPx }}>
              <div className="sticky top-0 z-20 flex border-b border-neutral-200 bg-[#f7f7f8]/">
                <div
                  className="sticky left-0 z-30 flex h-12 items-end border-r border-neutral-200 bg-[#f7f7f8] px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400"
                  style={{ width: LABEL_WIDTH }}
                >
                  All campaigns
                </div>
                <div className="relative h-12" style={{ width: range.widthPx }}>
                  {ticks.map((tick) => (
                    <div
                      key={tick.key}
                      className="absolute bottom-0 top-0 border-l border-neutral-200/80 px-1.5"
                      style={{ left: tick.x, width: tick.width }}
                    >
                      <div className="pt-2 text-[10px] font-medium text-neutral-500">
                        {tick.label}
                      </div>
                    </div>
                  ))}
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-sky-500"
                    style={{ left: todayX }}
                  >
                    <span className="absolute left-1/2 top-1 -translate-x-1/2 rounded-md bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {range.today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {campaigns === null ? (
                <div className="p-8 text-sm text-neutral-500">Loading campaigns…</div>
              ) : campaigns.length === 0 ? (
                <div className="p-10 text-center text-sm text-neutral-500">
                  No campaigns yet. Create one to start planning on the timeline.
                </div>
              ) : (
                <div
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  {campaigns.map((campaign) => {
                    const startStr =
                      draftDates[campaign.id]?.start ?? campaign.start_date
                    const endStr = draftDates[campaign.id]?.end ?? campaign.end_date
                    const start = parseDateOnly(startStr)
                    const end = parseDateOnly(endStr)
                    const selected = selectedId === campaign.id
                    let left = 0
                    let width = 48
                    if (start && end) {
                      left = dateToX(start, range, zoom)
                      width = Math.max(24, dateToX(end, range, zoom) + pxPerDay(zoom) - left)
                    }
                    return (
                      <div
                        key={campaign.id}
                        className={`flex border-b border-neutral-100 ${
                          selected ? 'bg-white' : 'hover:bg-white/70'
                        }`}
                        style={{ height: ROW_HEIGHT }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(campaign.id)}
                          className="sticky left-0 z-10 flex items-center gap-2 border-r border-neutral-200 bg-inherit px-3 text-left"
                          style={{ width: LABEL_WIDTH }}
                        >
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ background: campaign.color || '#94a3b8' }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-neutral-800">
                              {campaign.name}
                            </span>
                            <span className="block truncate text-[11px] text-neutral-500">
                              {campaignStatusLabel(campaign.status)}
                              {startStr && endStr
                                ? ` · ${formatCampaignDate(startStr)} → ${formatCampaignDate(endStr)}`
                                : ''}
                            </span>
                          </span>
                        </button>

                        <div
                          className="relative"
                          style={{ width: range.widthPx }}
                          onClick={() => setSelectedId(campaign.id)}
                        >
                          <div
                            className="pointer-events-none absolute bottom-0 top-0 w-px bg-sky-500/40"
                            style={{ left: todayX }}
                          />
                          {start && end ? (
                            <div
                              className={`absolute top-1/2 flex h-7 -translate-y-1/2 items-center rounded-md border bg-white shadow-sm ${
                                selected
                                  ? 'border-sky-400 ring-2 ring-sky-200'
                                  : 'border-neutral-200'
                              }`}
                              style={{
                                left,
                                width,
                                borderLeftColor: campaign.color || '#94a3b8',
                                borderLeftWidth: 3
                              }}
                              onPointerDown={(e) => onPointerDownBar(e, campaign, 'move')}
                            >
                              <div
                                className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
                                onPointerDown={(e) =>
                                  onPointerDownBar(e, campaign, 'resize-start')
                                }
                              />
                              <div className="min-w-0 flex-1 cursor-grab px-2 text-[11px] font-medium text-neutral-700 active:cursor-grabbing">
                                <span className="block truncate">{campaign.name}</span>
                              </div>
                              <div
                                className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
                                onPointerDown={(e) =>
                                  onPointerDownBar(e, campaign, 'resize-end')
                                }
                              />
                            </div>
                          ) : (
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400">
                              Set dates in the sidecar
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedId ? (
          <CampaignSidecar
            campaignId={selectedId}
            onClose={() => setSelectedId(null)}
            onUpdated={(campaign) => {
              setCampaigns((rows) =>
                (rows ?? []).map((row) => (row.id === campaign.id ? campaign : row))
              )
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
