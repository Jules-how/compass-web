'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { CampaignSidecar } from '@/components/campaigns/CampaignSidecar'
import {
  createLocalCampaign,
  deleteLocalCampaign,
  listLocalCampaigns,
  updateLocalCampaign
} from '@/lib/campaign-local-store'
import {
  campaignStatusLabel,
  formatCampaignDate,
  type CompassCampaign
} from '@/lib/campaigns'
import {
  ZOOM_OPTIONS,
  buildHeaderModel,
  buildTimelineRange,
  clampDateOrder,
  dateToX,
  formatHoverDate,
  parseDateOnly,
  pxPerDay,
  toDateOnly,
  xToDate,
  type TimelineZoom
} from '@/lib/campaign-timeline'

const ROW_HEIGHT = 48
const LABEL_WIDTH = 320
const EMPTY_ROWS = 14
const HEADER_HEIGHT = 52

type DragMode = 'move' | 'resize-start' | 'resize-end'
type DragState = {
  id: string
  mode: DragMode
  originX: number
  start: string
  end: string
}

type DisplayProps = {
  showStatus: boolean
  showPriority: boolean
  showHealth: boolean
  showLead: boolean
  showWeekNumbers: boolean
  showList: boolean
}

const DEFAULT_DISPLAY: DisplayProps = {
  showStatus: true,
  showPriority: true,
  showHealth: true,
  showLead: true,
  showWeekNumbers: true,
  showList: true
}

export function CampaignPlanner() {
  const [campaigns, setCampaigns] = useState<CompassCampaign[]>([])
  const [ready, setReady] = useState(false)
  const [zoom, setZoom] = useState<TimelineZoom>('year')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sidecarOpen, setSidecarOpen] = useState(true)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [draftDates, setDraftDates] = useState<Record<string, { start: string; end: string }>>({})
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [display, setDisplay] = useState<DisplayProps>(DEFAULT_DISPLAY)
  const [pinned, setPinned] = useState<Record<string, boolean>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const didCenterToday = useRef(false)

  const refresh = useCallback(() => {
    setCampaigns(listLocalCampaigns())
    setReady(true)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (priorityFilter !== 'all' && String(c.priority) !== priorityFilter) return false
      if (query.trim() && !c.name.toLowerCase().includes(query.trim().toLowerCase())) return false
      return true
    })
  }, [campaigns, statusFilter, priorityFilter, query])

  const ordered = useMemo(() => {
    return filtered.slice().sort((a, b) => {
      const ap = pinned[a.id] ? 0 : 1
      const bp = pinned[b.id] ? 0 : 1
      if (ap !== bp) return ap - bp
      const as = a.start_date || '9999'
      const bs = b.start_date || '9999'
      return as.localeCompare(bs) || a.name.localeCompare(b.name)
    })
  }, [filtered, pinned])

  const range = useMemo(() => {
    return buildTimelineRange(
      ordered.flatMap((c) => [
        draftDates[c.id]?.start ?? c.start_date,
        draftDates[c.id]?.end ?? c.end_date
      ]),
      zoom
    )
  }, [ordered, draftDates, zoom])

  const header = useMemo(
    () => buildHeaderModel(range, zoom, display.showWeekNumbers),
    [range, zoom, display.showWeekNumbers]
  )
  const todayX = dateToX(range.today, range, zoom)
  const gridHeight = Math.max(ordered.length, EMPTY_ROWS) * ROW_HEIGHT
  const listWidth = display.showList ? LABEL_WIDTH : 0

  const scrollToToday = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const el = scrollRef.current
      if (!el) return
      el.scrollTo({ left: Math.max(0, todayX - el.clientWidth * 0.38), behavior })
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
      if (key === 'escape') {
        setSelectedId(null)
        setMenuId(null)
        setFilterOpen(false)
        setDisplayOpen(false)
      }
      if (key === 'y' || key === 'q' || key === 'm' || key === 'w') {
        didCenterToday.current = false
        setZoom(key === 'y' ? 'year' : key === 'q' ? 'quarter' : key === 'm' ? 'month' : 'week')
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
    setSidecarOpen(true)
  }

  function persistDates(id: string, start: string, end: string) {
    const orderedDates = clampDateOrder(start, end)
    updateLocalCampaign(id, { start_date: orderedDates.start, end_date: orderedDates.end })
    setDraftDates((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    refresh()
  }

  function onPointerDownBar(e: ReactPointerEvent, campaign: CompassCampaign, mode: DragMode) {
    e.preventDefault()
    e.stopPropagation()
    const start = draftDates[campaign.id]?.start ?? campaign.start_date
    const end = draftDates[campaign.id]?.end ?? campaign.end_date
    if (!start || !end) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setSelectedId(campaign.id)
    setSidecarOpen(true)
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

  function onTimelineMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0) - listWidth
    if (x < 0) {
      setHoverDate(null)
      setHoverX(null)
      return
    }
    setHoverX(x)
    setHoverDate(xToDate(x, range, zoom))
  }

  const selected = selectedId && sidecarOpen ? selectedId : null

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f7f8f9] text-neutral-900">
      <header className="relative z-40 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-neutral-200/80 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">Campaign Planner</h1>
          <span className="text-neutral-300">/</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[13px] text-neutral-600 hover:bg-neutral-100"
          >
            All campaigns
            <span className="text-[10px] text-neutral-400">▾</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <ToolbarIconButton
            label="Filter"
            active={filterOpen || statusFilter !== 'all' || priorityFilter !== 'all' || Boolean(query)}
            onClick={() => {
              setFilterOpen((v) => !v)
              setDisplayOpen(false)
            }}
          >
            <FilterIcon />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Display options"
            active={displayOpen}
            onClick={() => {
              setDisplayOpen((v) => !v)
              setFilterOpen(false)
            }}
          >
            <DisplayIcon />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Toggle details"
            active={sidecarOpen && Boolean(selectedId)}
            onClick={() => setSidecarOpen((v) => !v)}
          >
            <PanelIcon />
          </ToolbarIconButton>

          <button
            type="button"
            onClick={() => scrollToToday('smooth')}
            className="ml-1 h-7 rounded-md border border-neutral-200 bg-white px-2.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
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
            className="flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none text-neutral-600 hover:bg-neutral-100"
            aria-label="New campaign"
            title="New campaign"
          >
            +
          </button>
        </div>

        {filterOpen ? (
          <Popover onClose={() => setFilterOpen(false)} className="right-36 top-12 w-72">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
              Filter
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title…"
              className="mb-2 w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm"
            />
            <label className="mb-2 block text-xs text-neutral-500">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
              >
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className="block text-xs text-neutral-500">
              Priority
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
              >
                <option value="all">All</option>
                <option value="0">No priority</option>
                <option value="1">Urgent</option>
                <option value="2">High</option>
                <option value="3">Medium</option>
                <option value="4">Low</option>
              </select>
            </label>
            <button
              type="button"
              className="mt-3 text-xs font-medium text-neutral-500 hover:text-neutral-800"
              onClick={() => {
                setQuery('')
                setStatusFilter('all')
                setPriorityFilter('all')
              }}
            >
              Reset filters
            </button>
          </Popover>
        ) : null}

        {displayOpen ? (
          <Popover onClose={() => setDisplayOpen(false)} className="right-28 top-12 w-72">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
              Display
            </div>
            <div className="mb-3 flex rounded-lg border border-neutral-200 p-0.5 text-xs">
              {(['List', 'Board', 'Timeline'] as const).map((mode) => (
                <span
                  key={mode}
                  className={`flex-1 rounded-md px-2 py-1.5 text-center font-medium ${
                    mode === 'Timeline' ? 'bg-neutral-900 text-white' : 'text-neutral-400'
                  }`}
                >
                  {mode}
                </span>
              ))}
            </div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
              Timeline options
            </div>
            {(
              [
                ['showList', 'Show campaign list'],
                ['showWeekNumbers', 'Show week numbers'],
                ['showStatus', 'Status'],
                ['showPriority', 'Priority'],
                ['showHealth', 'Health'],
                ['showLead', 'Lead']
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm text-neutral-700"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={display[key]}
                  onChange={(e) => setDisplay((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
              </label>
            ))}
          </Popover>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            <div
              className="relative"
              style={{ minWidth: listWidth + range.widthPx, minHeight: '100%' }}
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
                {display.showList ? (
                  <div
                    className="sticky left-0 z-40 flex items-end border-r border-neutral-200/80 bg-[#f7f8f9] px-3 pb-2 text-[12px] font-medium text-neutral-500"
                    style={{ width: LABEL_WIDTH }}
                  >
                    All campaigns
                    <span className="ml-2 tabular-nums text-neutral-400">{ordered.length}</span>
                  </div>
                ) : null}
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
                      <div className="px-1 text-[10px] tabular-nums text-neutral-400">
                        {tick.label}
                      </div>
                    </div>
                  ))}
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 z-10 bg-[#5e6ad2]/15"
                    style={{ left: todayX, width: Math.max(pxPerDay(zoom), 2) }}
                  >
                    <div className="absolute inset-y-0 left-0 w-px bg-[#5e6ad2]" />
                    <span className="absolute left-1/2 top-1 z-20 -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-[#5e6ad2] px-1.5 py-[2px] text-[10px] font-semibold text-white">
                      {range.today
                        .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        .toUpperCase()}
                    </span>
                  </div>
                  {hoverDate && hoverX !== null && !drag ? (
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 z-20"
                      style={{ left: hoverX }}
                    >
                      <div className="absolute inset-y-0 w-px bg-neutral-400/50" />
                      <span className="absolute left-1/2 top-1 z-30 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-white">
                        {formatHoverDate(hoverDate)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                className="relative"
                style={{ minHeight: gridHeight }}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <div
                  className="pointer-events-none absolute bottom-0 top-0"
                  style={{ left: listWidth, width: range.widthPx }}
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
                    className="absolute bottom-0 top-0 bg-[#5e6ad2]/10"
                    style={{ left: todayX, width: Math.max(pxPerDay(zoom), 2) }}
                  >
                    <div className="absolute inset-y-0 left-0 w-px bg-[#5e6ad2]/50" />
                  </div>
                </div>

                {ordered.map((campaign) => {
                  const startStr = draftDates[campaign.id]?.start ?? campaign.start_date
                  const endStr = draftDates[campaign.id]?.end ?? campaign.end_date
                  const start = parseDateOnly(startStr)
                  const end = parseDateOnly(endStr)
                  const isSelected = selectedId === campaign.id
                  let left = 0
                  let width = 40
                  if (start && end) {
                    left = dateToX(start, range, zoom)
                    width = Math.max(28, dateToX(end, range, zoom) + pxPerDay(zoom) - left)
                  }

                  return (
                    <div
                      key={campaign.id}
                      className={`group relative flex border-b border-neutral-100 ${
                        isSelected ? 'bg-white' : 'hover:bg-white/90'
                      }`}
                      style={{ height: ROW_HEIGHT }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setMenuId(campaign.id)
                        setSelectedId(campaign.id)
                      }}
                    >
                      {display.showList ? (
                        <div
                          className="sticky left-0 z-20 flex items-center gap-2 border-r border-neutral-200/80 bg-inherit px-3"
                          style={{ width: LABEL_WIDTH }}
                        >
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            onClick={() => {
                              setSelectedId(campaign.id)
                              setSidecarOpen(true)
                            }}
                            title={campaign.name}
                          >
                            <span
                              className="h-4 w-4 shrink-0 rounded-full"
                              style={{ background: campaign.color || '#94a3b8' }}
                            />
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-800">
                              {campaign.name}
                            </span>
                          </button>

                          <div className="flex shrink-0 items-center gap-1 text-neutral-400">
                            {display.showStatus ? <StatusGlyph status={campaign.status} /> : null}
                            {display.showPriority ? (
                              <PriorityGlyph priority={campaign.priority} />
                            ) : null}
                            {display.showHealth ? <HealthGlyph health={campaign.health} /> : null}
                            {display.showLead ? (
                              <LeadGlyph label={campaign.owner_label} />
                            ) : null}
                            <button
                              type="button"
                              className={`rounded p-0.5 opacity-0 hover:bg-neutral-100 group-hover:opacity-100 ${
                                pinned[campaign.id] ? 'opacity-100 text-amber-500' : ''
                              }`}
                              title={pinned[campaign.id] ? 'Unpin' : 'Pin'}
                              onClick={() =>
                                setPinned((prev) => ({ ...prev, [campaign.id]: !prev[campaign.id] }))
                              }
                            >
                              ★
                            </button>
                            <button
                              type="button"
                              className="rounded p-0.5 opacity-0 hover:bg-neutral-100 group-hover:opacity-100"
                              title="More"
                              onClick={() => setMenuId((id) => (id === campaign.id ? null : campaign.id))}
                            >
                              ···
                            </button>
                          </div>

                          {menuId === campaign.id ? (
                            <div className="absolute left-3 top-10 z-50 w-52 rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-lg">
                              <MenuItem
                                onClick={() => {
                                  setSelectedId(campaign.id)
                                  setSidecarOpen(true)
                                  setMenuId(null)
                                }}
                              >
                                Open campaign…
                              </MenuItem>
                              <MenuItem
                                onClick={() => {
                                  updateLocalCampaign(campaign.id, { status: 'active' })
                                  refresh()
                                  setMenuId(null)
                                }}
                              >
                                Set status · Active
                              </MenuItem>
                              <MenuItem
                                onClick={() => {
                                  updateLocalCampaign(campaign.id, { priority: 2 })
                                  refresh()
                                  setMenuId(null)
                                }}
                              >
                                Set priority · High
                              </MenuItem>
                              <MenuItem
                                onClick={() => {
                                  void navigator.clipboard?.writeText(campaign.name)
                                  setMenuId(null)
                                }}
                              >
                                Copy name
                              </MenuItem>
                              <MenuItem
                                danger
                                onClick={() => {
                                  deleteLocalCampaign(campaign.id)
                                  if (selectedId === campaign.id) setSelectedId(null)
                                  refresh()
                                  setMenuId(null)
                                }}
                              >
                                Delete
                              </MenuItem>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div
                        className="relative"
                        style={{ width: range.widthPx }}
                        onClick={() => {
                          setSelectedId(campaign.id)
                          setSidecarOpen(true)
                        }}
                      >
                        {start && end ? (
                          <div
                            className={`absolute top-1/2 flex h-7 -translate-y-1/2 items-center rounded-md border bg-white ${
                              isSelected
                                ? 'border-[#5e6ad2] shadow-[0_0_0_1px_rgba(94,106,210,0.28)]'
                                : 'border-neutral-200 shadow-sm'
                            }`}
                            style={{ left, width }}
                            title={`${formatCampaignDate(startStr)} → ${formatCampaignDate(endStr)}`}
                            onPointerDown={(e) => onPointerDownBar(e, campaign, 'move')}
                          >
                            <div
                              className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize"
                              onPointerDown={(e) => onPointerDownBar(e, campaign, 'resize-start')}
                            />
                            <div
                              className="h-full w-1.5 shrink-0 rounded-l-[5px]"
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
                        ) : (
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400">
                            No dates
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {Array.from({ length: Math.max(0, EMPTY_ROWS - ordered.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex border-b border-neutral-100/70"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {display.showList ? (
                      <div
                        className="sticky left-0 z-20 border-r border-neutral-200/80 bg-[#f7f8f9]"
                        style={{ width: LABEL_WIDTH }}
                      />
                    ) : null}
                    <div style={{ width: range.widthPx }} />
                  </div>
                ))}

                {ready && ordered.length === 0 ? (
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

        {selected ? (
          <CampaignSidecar
            campaignId={selected}
            onClose={() => {
              setSelectedId(null)
            }}
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

function ToolbarIconButton({
  children,
  label,
  onClick,
  active
}: {
  children: ReactNode
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md border text-neutral-600 ${
        active
          ? 'border-neutral-300 bg-neutral-100'
          : 'border-transparent hover:border-neutral-200 hover:bg-neutral-50'
      }`}
    >
      {children}
    </button>
  )
}

function Popover({
  children,
  className,
  onClose
}: {
  children: ReactNode
  className?: string
  onClose: () => void
}) {
  return (
    <>
      <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={onClose} aria-label="Close" />
      <div
        className={`absolute z-50 rounded-xl border border-neutral-200 bg-white p-3 shadow-xl ${className ?? ''}`}
      >
        {children}
      </div>
    </>
  )
}

function MenuItem({
  children,
  onClick,
  danger
}: {
  children: ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left hover:bg-neutral-50 ${
        danger ? 'text-red-600' : 'text-neutral-700'
      }`}
    >
      {children}
    </button>
  )
}

function StatusGlyph({ status }: { status: string }) {
  const color =
    status === 'active'
      ? 'bg-yellow-400'
      : status === 'completed'
        ? 'bg-emerald-500'
        : status === 'paused'
          ? 'bg-orange-400'
          : status === 'cancelled'
            ? 'bg-red-400'
            : 'bg-neutral-300'
  return <span className={`h-2.5 w-2.5 rounded-full ${color}`} title={campaignStatusLabel(status)} />
}

function PriorityGlyph({ priority }: { priority: number }) {
  const filled = priority === 0 ? 0 : priority === 1 ? 3 : priority === 2 ? 3 : priority === 3 ? 2 : 1
  return (
    <span className="inline-flex h-3.5 w-3.5 items-end gap-[1px]" title={`Priority ${priority}`}>
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

function HealthGlyph({ health }: { health: string }) {
  const color =
    health === 'on_track'
      ? 'border-emerald-500'
      : health === 'at_risk'
        ? 'border-amber-500'
        : health === 'off_track'
          ? 'border-red-500'
          : 'border-neutral-300'
  return <span className={`h-2.5 w-2.5 rounded-full border-2 ${color}`} title={health} />
}

function LeadGlyph({ label }: { label: string | null }) {
  const initials = (label || '?')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span
      className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-semibold text-neutral-600"
      title={label || 'No lead'}
    >
      {initials}
    </span>
  )
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 3.5h11l-4 5v3.5l-3 1.5v-5l-4-5Z" />
    </svg>
  )
}

function DisplayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 5h10" />
      <path d="M3 8h10" />
      <path d="M3 11h10" />
      <circle cx="6" cy="5" r="1" fill="currentColor" />
      <circle cx="10" cy="8" r="1" fill="currentColor" />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" />
    </svg>
  )
}

function PanelIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M10 3v10" />
    </svg>
  )
}
