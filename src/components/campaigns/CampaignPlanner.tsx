'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { CampaignSidecar } from '@/components/campaigns/CampaignSidecar'
import {
  createLocalCampaign,
  listLocalCampaigns,
  updateLocalCampaign
} from '@/lib/campaign-local-store'
import { campaignStatusLabel, formatCampaignDate, type CompassCampaign } from '@/lib/campaigns'
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

const ROW_HEIGHT = 44
const LABEL_WIDTH = 248
const EMPTY_ROWS = 12

type DragMode = 'move' | 'resize-start' | 'resize-end'

type DragState = {
  id: string
  mode: DragMode
  originX: number
  start: string
  end: string
}

export function CampaignPlanner() {
  const [campaigns, setCampaigns] = useState<CompassCampaign[]>([])
  const [ready, setReady] = useState(false)
  const [zoom, setZoom] = useState<TimelineZoom>('year')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [draftDates, setDraftDates] = useState<Record<string, { start: string; end: string }>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const didCenterToday = useRef(false)

  const refresh = useCallback(() => {
    setCampaigns(listLocalCampaigns())
    setReady(true)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const range = useMemo(() => {
    return buildTimelineRange(
      campaigns.flatMap((c) => [
        draftDates[c.id]?.start ?? c.start_date,
        draftDates[c.id]?.end ?? c.end_date
      ]),
      zoom
    )
  }, [campaigns, draftDates, zoom])

  const ticks = useMemo(() => buildHeaderTicks(range, zoom), [range, zoom])
  const todayX = dateToX(range.today, range, zoom)
  const gridHeight = Math.max(campaigns.length, EMPTY_ROWS) * ROW_HEIGHT

  const scrollToToday = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const el = scrollRef.current
      if (!el) return
      const target = Math.max(0, todayX - el.clientWidth * 0.38)
      el.scrollTo({ left: target, behavior })
    },
    [todayX]
  )

  useEffect(() => {
    if (!ready || didCenterToday.current) return
    scrollToToday('auto')
    didCenterToday.current = true
  }, [ready, scrollToToday])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.target instanceof HTMLSelectElement) return
      const key = e.key.toLowerCase()
      if (key === 'escape') setSelectedId(null)
      if (key === 'y') {
        didCenterToday.current = false
        setZoom('year')
      }
      if (key === 'q') {
        didCenterToday.current = false
        setZoom('quarter')
      }
      if (key === 'm') {
        didCenterToday.current = false
        setZoom('month')
      }
      if (key === 'w') {
        didCenterToday.current = false
        setZoom('week')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function createCampaign() {
    const today = toDateOnly(range.today)
    const end = toDateOnly(
      new Date(range.today.getFullYear(), range.today.getMonth() + 1, range.today.getDate())
    )
    const campaign = createLocalCampaign({
      name: 'New campaign',
      start_date: today,
      end_date: end
    })
    refresh()
    setSelectedId(campaign.id)
  }

  function persistDates(id: string, start: string, end: string) {
    const ordered = clampDateOrder(start, end)
    updateLocalCampaign(id, { start_date: ordered.start, end_date: ordered.end })
    setDraftDates((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    refresh()
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
    setDrag({ id: campaign.id, mode, originX: e.clientX, start, end })
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!drag) return
    const deltaDays = Math.round((e.clientX - drag.originX) / pxPerDay(zoom))
    const startDate = parseDateOnly(drag.start)
    const endDate = parseDateOnly(drag.end)
    if (!startDate || !endDate) return

    let nextStart = new Date(startDate)
    let nextEnd = new Date(endDate)
    if (drag.mode === 'move') {
      nextStart.setDate(nextStart.getDate() + deltaDays)
      nextEnd.setDate(nextEnd.getDate() + deltaDays)
    } else if (drag.mode === 'resize-start') {
      nextStart.setDate(nextStart.getDate() + deltaDays)
      if (nextStart > endDate) nextStart = new Date(endDate)
    } else {
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
    if (start !== drag.start || end !== drag.end) persistDates(drag.id, start, end)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f7f8f9] text-neutral-900">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-neutral-200/80 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">Campaign Planner</h1>
          <span className="hidden text-neutral-300 sm:inline">/</span>
          <span className="hidden truncate text-[13px] text-neutral-500 sm:inline">
            All campaigns
          </span>
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
                setZoom(e.target.value as TimelineZoom)
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
          <button
            type="button"
            onClick={createCampaign}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100"
            aria-label="New campaign"
            title="New campaign"
          >
            +
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            <div
              className="relative"
              style={{ minWidth: LABEL_WIDTH + range.widthPx, minHeight: '100%' }}
            >
              {/* Date header */}
              <div className="sticky top-0 z-30 flex h-11 border-b border-neutral-200/80 bg-[#f7f8f9]/">
                <div
                  className="sticky left-0 z-40 flex items-end border-r border-neutral-200/80 bg-[#f7f8f9] px-3 pb-2 text-[11px] font-medium text-neutral-500"
                  style={{ width: LABEL_WIDTH }}
                >
                  All campaigns
                </div>
                <div className="relative" style={{ width: range.widthPx }}>
                  {ticks.map((tick) => (
                    <div
                      key={tick.key}
                      className="absolute inset-y-0 border-l border-neutral-200/70"
                      style={{ left: tick.x, width: Math.max(tick.width, 1) }}
                    >
                      <div className="px-1.5 pt-2 text-[10px] font-medium uppercase tracking-[0.04em] text-neutral-500">
                        {tick.label}
                      </div>
                      {tick.sublabel ? (
                        <div className="px-1.5 text-[10px] text-neutral-400">{tick.sublabel}</div>
                      ) : null}
                    </div>
                  ))}
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-[#5e6ad2]"
                    style={{ left: todayX }}
                  >
                    <span className="absolute left-1/2 top-1.5 -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-[#5e6ad2] px-1.5 py-[2px] text-[10px] font-semibold text-white">
                      {range.today
                        .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        .toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div
                className="relative"
                style={{ minHeight: gridHeight }}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {/* Vertical grid + today line spanning body */}
                <div
                  className="pointer-events-none absolute bottom-0 top-0"
                  style={{ left: LABEL_WIDTH, width: range.widthPx }}
                >
                  {ticks.map((tick) => (
                    <div
                      key={`grid-${tick.key}`}
                      className="absolute bottom-0 top-0 border-l border-neutral-200/50"
                      style={{ left: tick.x }}
                    />
                  ))}
                  <div
                    className="absolute bottom-0 top-0 w-px bg-[#5e6ad2]/40"
                    style={{ left: todayX }}
                  />
                </div>

                {campaigns.map((campaign) => {
                  const startStr = draftDates[campaign.id]?.start ?? campaign.start_date
                  const endStr = draftDates[campaign.id]?.end ?? campaign.end_date
                  const start = parseDateOnly(startStr)
                  const end = parseDateOnly(endStr)
                  const selected = selectedId === campaign.id
                  let left = 0
                  let width = 40
                  if (start && end) {
                    left = dateToX(start, range, zoom)
                    width = Math.max(28, dateToX(end, range, zoom) + pxPerDay(zoom) - left)
                  }

                  return (
                    <div
                      key={campaign.id}
                      className={`relative flex border-b border-neutral-100 ${
                        selected ? 'bg-white' : 'hover:bg-white/80'
                      }`}
                      style={{ height: ROW_HEIGHT }}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(campaign.id)}
                        className="sticky left-0 z-20 flex items-center gap-2.5 border-r border-neutral-200/80 bg-inherit px-3 text-left"
                        style={{ width: LABEL_WIDTH }}
                      >
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-[4px]"
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
                        {start && end ? (
                          <div
                            className={`absolute top-1/2 flex h-6 -translate-y-1/2 items-center rounded-md border bg-white ${
                              selected
                                ? 'border-[#5e6ad2] shadow-[0_0_0_1px_rgba(94,106,210,0.25)]'
                                : 'border-neutral-200 shadow-sm'
                            }`}
                            style={{ left, width }}
                            onPointerDown={(e) => onPointerDownBar(e, campaign, 'move')}
                          >
                            <div
                              className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize"
                              onPointerDown={(e) => onPointerDownBar(e, campaign, 'resize-start')}
                            />
                            <div
                              className="h-full w-1 shrink-0 rounded-l-md"
                              style={{ background: campaign.color || '#94a3b8' }}
                            />
                            <div className="min-w-0 flex-1 cursor-grab px-2 text-[11px] font-medium text-neutral-700 active:cursor-grabbing">
                              <span className="block truncate">{campaign.name}</span>
                            </div>
                            <div
                              className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize"
                              onPointerDown={(e) => onPointerDownBar(e, campaign, 'resize-end')}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}

                {/* Empty filler rows so the grid always looks like Linear */}
                {Array.from({ length: Math.max(0, EMPTY_ROWS - campaigns.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex border-b border-neutral-100/80"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <div
                      className="sticky left-0 z-20 border-r border-neutral-200/80 bg-[#f7f8f9]"
                      style={{ width: LABEL_WIDTH }}
                    />
                    <div style={{ width: range.widthPx }} />
                  </div>
                ))}

                {ready && campaigns.length === 0 ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="pointer-events-auto rounded-xl border border-neutral-200 bg-white/95 px-5 py-4 text-center shadow-sm backdrop-blur">
                      <p className="text-sm font-medium text-neutral-800">No campaigns yet</p>
                      <p className="mt-1 max-w-xs text-xs text-neutral-500">
                        Create a campaign to place it on the timeline. Drag to move, pull the edges
                        to change duration.
                      </p>
                      <button
                        type="button"
                        onClick={createCampaign}
                        className="mt-3 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
                      >
                        New campaign
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {selectedId ? (
          <CampaignSidecar
            campaignId={selectedId}
            onClose={() => setSelectedId(null)}
            onUpdated={() => refresh()}
            onDeleted={() => {
              setSelectedId(null)
              refresh()
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
