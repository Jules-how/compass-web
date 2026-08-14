'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { useRouter } from 'next/navigation'
import { CampaignCalendar } from '@/components/campaigns/CampaignCalendar'
import { CampaignSidecar } from '@/components/campaigns/CampaignSidecar'
import {
  CALENDAR_GRAINS,
  shiftCursor,
  type CalendarGrain
} from '@/lib/campaign-calendar'
import { useTimelineWheelZoom } from '@/hooks/useTimelineWheelZoom'
import {
  createCampaign as createCampaignRemote,
  deleteCampaign as deleteCampaignRemote,
  listCampaigns,
  updateCampaign
} from '@/lib/campaigns-client'
import {
  CAMPAIGN_HEALTHS,
  CAMPAIGN_STATUSES,
  campaignHealthLabel,
  campaignPriorityLabel,
  campaignStatusLabel,
  formatCampaignDate,
  normalizeCampaignStatus,
  type CampaignStatus,
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
  startOfDay,
  toDateOnly,
  xToDate,
  zoomFromPxPerDay,
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

type ViewMode = 'list' | 'board' | 'timeline' | 'calendar'

type DisplayProps = {
  showStatus: boolean
  showPriority: boolean
  showHealth: boolean
  showLead: boolean
  showWeekNumbers: boolean
  showList: boolean
}

type RowMenuKind = 'actions' | 'status' | 'priority' | 'health'
/** `left` = side pop-out beside the trigger (keeps the timeline bar clear). */
type RowMenuPlacement = 'below' | 'left'
type RowMenuState = {
  campaignId: string
  kind: RowMenuKind
  x: number
  y: number
  placement: RowMenuPlacement
}

const DEFAULT_DISPLAY: DisplayProps = {
  showStatus: true,
  showPriority: true,
  showHealth: true,
  showLead: true,
  showWeekNumbers: true,
  showList: true
}

const PRIORITY_OPTIONS = [0, 1, 2, 3, 4] as const

export function CampaignPlanner() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<CompassCampaign[]>([])
  const [ready, setReady] = useState(false)
  /** Continuous px/day — wheel zooms smoothly; named zoom is derived for chrome. */
  const [density, setDensity] = useState(() => pxPerDay('year'))
  const zoom = zoomFromPxPerDay(density)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sidecarOpen, setSidecarOpen] = useState(true)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [draftDates, setDraftDates] = useState<Record<string, { start: string; end: string }>>({})
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null)
  const [view, setView] = useState<ViewMode>('timeline')
  const [calendarGrain, setCalendarGrain] = useState<CalendarGrain>('month')
  const [calendarCursor, setCalendarCursor] = useState(() => startOfDay(new Date()))
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [display, setDisplay] = useState<DisplayProps>(DEFAULT_DISPLAY)
  const [pinned, setPinned] = useState<Record<string, boolean>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null)
  const didCenterToday = useRef(false)

  const setTimelineScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node
    setScrollNode(node)
  }, [])

  const refresh = useCallback(() => {
    void listCampaigns()
      .then((rows) => {
        setCampaigns(rows)
        setReady(true)
      })
      .catch(() => {
        setCampaigns([])
        setReady(true)
      })
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
      zoom,
      undefined,
      density
    )
  }, [ordered, draftDates, zoom, density])

  const header = useMemo(
    () => buildHeaderModel(range, zoom, display.showWeekNumbers),
    [range, zoom, display.showWeekNumbers]
  )
  const todayX = dateToX(range.today, range)
  const dayWidth = range.pxPerDay
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
    if (!ready || view !== 'timeline' || didCenterToday.current) return
    scrollToToday('auto')
    didCenterToday.current = true
  }, [ready, view, scrollToToday])

  useTimelineWheelZoom({
    scrollRef,
    density,
    range,
    labelWidth: listWidth,
    // Re-bind when the timeline scroller mounts (view switches) or first paints.
    enabled: view === 'timeline' && scrollNode !== null,
    onDensityChange: setDensity,
    onBeforeZoom: () => {
      // Keep the date under the cursor; skip the "center on today" path.
      didCenterToday.current = true
    }
  })

  const setZoomLevel = useCallback((next: TimelineZoom) => {
    didCenterToday.current = false
    setDensity(pxPerDay(next))
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.target instanceof HTMLSelectElement) return
      const key = e.key.toLowerCase()
      if (key === 'escape') {
        setSelectedId(null)
        setRowMenu(null)
        setFilterOpen(false)
        setDisplayOpen(false)
      }
      if (view === 'timeline' && (key === 'y' || key === 'q' || key === 'm' || key === 'w')) {
        setZoomLevel(key === 'y' ? 'year' : key === 'q' ? 'quarter' : key === 'm' ? 'month' : 'week')
      }
      if (view === 'calendar') {
        if (key === 'd') setCalendarGrain('day')
        if (key === 'w') setCalendarGrain('week')
        if (key === 'm') setCalendarGrain('month')
        if (e.key === 'ArrowLeft') setCalendarCursor((cur) => shiftCursor(cur, calendarGrain, -1))
        if (e.key === 'ArrowRight') setCalendarCursor((cur) => shiftCursor(cur, calendarGrain, 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setZoomLevel, view, calendarGrain])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function closeMenus() {
      setRowMenu(null)
    }
    el.addEventListener('scroll', closeMenus, { passive: true })
    return () => el.removeEventListener('scroll', closeMenus)
  }, [ready, view])

  function openRowMenu(
    campaignId: string,
    kind: RowMenuKind,
    anchor: HTMLElement,
    placement: RowMenuPlacement = 'left'
  ) {
    const rect = anchor.getBoundingClientRect()
    setFilterOpen(false)
    setDisplayOpen(false)
    setRowMenu((prev) =>
      prev && prev.campaignId === campaignId && prev.kind === kind
        ? null
        : {
            campaignId,
            kind,
            // Anchor at the trigger; FixedMenu places the panel beside or below.
            x: placement === 'left' ? rect.left : Math.min(rect.left, window.innerWidth - 220),
            y: placement === 'left' ? rect.top : rect.bottom + 4,
            placement
          }
    )
  }

  function openCampaignPage(id: string) {
    setRowMenu(null)
    router.push(`/sales/pipeline/${id}`)
  }

  function createCampaign(nextStatus?: CampaignStatus, openCopyEditor = false) {
    const today = toDateOnly(range.today)
    const end = toDateOnly(
      new Date(range.today.getFullYear(), range.today.getMonth() + 1, range.today.getDate())
    )
    void createCampaignRemote({
      name: 'New campaign',
      start_date: today,
      end_date: end,
      status: nextStatus
    })
      .then((campaign) => {
        refresh()
        setSelectedId(campaign.id)
        setSidecarOpen(true)
        if (openCopyEditor) router.push(`/sales/outbound/editor/${campaign.id}`)
      })
      .catch(() => {
        refresh()
      })
  }

  function openCampaign(id: string) {
    setSelectedId(id)
    setSidecarOpen(true)
    setRowMenu(null)
  }

  function moveCampaignStatus(id: string, status: CampaignStatus) {
    void updateCampaign(id, { status }).then(refresh).catch(refresh)
  }

  function persistDates(id: string, start: string, end: string) {
    const orderedDates = clampDateOrder(start, end)
    void updateCampaign(id, {
      start_date: orderedDates.start,
      end_date: orderedDates.end
    })
      .then(refresh)
      .catch(refresh)
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
    setRowMenu(null)
    setDrag({ id: campaign.id, mode, originX: e.clientX, start, end })
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!drag) return
    const deltaDays = Math.round((e.clientX - drag.originX) / dayWidth)
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
    setHoverDate(xToDate(x, range))
  }

  const selected = selectedId && sidecarOpen ? selectedId : null
  const menuCampaign = rowMenu ? campaigns.find((c) => c.id === rowMenu.campaignId) : null

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#f7f8f9] text-neutral-900">
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
              setRowMenu(null)
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
              setRowMenu(null)
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

          {view === 'timeline' || view === 'calendar' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (view === 'calendar') setCalendarCursor(startOfDay(new Date()))
                  else scrollToToday('smooth')
                }}
                className="ml-1 h-7 rounded-md border border-neutral-200 bg-white px-2.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Today
              </button>
              {view === 'calendar' ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous period"
                    onClick={() => setCalendarCursor((cur) => shiftCursor(cur, calendarGrain, -1))}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="Next period"
                    onClick={() => setCalendarCursor((cur) => shiftCursor(cur, calendarGrain, 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                  >
                    ›
                  </button>
                  <label className="relative">
                    <select
                      value={calendarGrain}
                      onChange={(e) => setCalendarGrain(e.target.value as CalendarGrain)}
                      className="h-7 appearance-none rounded-md border border-neutral-200 bg-white py-0 pl-2.5 pr-7 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      {CALENDAR_GRAINS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400">
                      ▾
                    </span>
                  </label>
                </>
              ) : (
                <label className="relative">
                  <select
                    value={zoom}
                    onChange={(e) => {
                      setZoomLevel(e.target.value as TimelineZoom)
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
              )}
            </>
          ) : null}
          <button
            type="button"
            onClick={() => createCampaign()}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none text-neutral-600 hover:bg-neutral-100"
            aria-label="New campaign"
            title="New campaign"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => createCampaign(undefined, true)}
            className="flex h-7 items-center rounded-md px-2 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100"
            title="New campaign with copy editor"
          >
            + Copy
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
            <div className="mb-3 grid grid-cols-2 gap-0.5 rounded-lg border border-neutral-200 p-0.5 text-xs">
              {(
                [
                  ['list', 'List'],
                  ['board', 'Board'],
                  ['timeline', 'Timeline'],
                  ['calendar', 'Calendar']
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setView(mode)
                    setRowMenu(null)
                    if (mode === 'timeline') didCenterToday.current = false
                    if (mode === 'calendar') setCalendarCursor(startOfDay(new Date()))
                  }}
                  className={`rounded-md px-2 py-1.5 text-center font-medium ${
                    view === mode
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {view === 'timeline' ? (
              <>
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
              </>
            ) : (
              <p className="text-xs leading-relaxed text-neutral-500">
                {view === 'list'
                  ? 'List shows every campaign in a sortable table. Open a row to edit details.'
                  : view === 'board'
                    ? 'Board groups campaigns by status. Use the card menu to move between columns.'
                    : 'Calendar places the same dated campaigns on a day, week, or month grid.'}
              </p>
            )}
          </Popover>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          {view === 'list' ? (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="hidden gap-3 border-b border-neutral-200 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)]">
                  <div>Name</div>
                  <div>Status</div>
                  <div>Priority</div>
                  <div>Health</div>
                  <div>Start</div>
                  <div>End</div>
                  <div>Lead</div>
                </div>
                {ready && ordered.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-neutral-800">No campaigns yet</p>
                    <p className="mt-1 text-xs text-neutral-500">Create a campaign to start planning.</p>
                    <button
                      type="button"
                      onClick={() => createCampaign()}
                      className="mt-3 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
                    >
                      New campaign
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {ordered.map((campaign) => (
                      <li key={campaign.id}>
                        <button
                          type="button"
                          onClick={() => openCampaign(campaign.id)}
                          onDoubleClick={() => openCampaignPage(campaign.id)}
                          title={`${campaign.name} — double-click to open page`}
                          className={`grid w-full gap-3 px-4 py-3 text-left transition hover:bg-neutral-50 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)] lg:items-center ${
                            selectedId === campaign.id ? 'bg-neutral-50' : ''
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-3.5 w-3.5 shrink-0 rounded-full"
                              style={{ background: campaign.color || '#94a3b8' }}
                            />
                            <div className="min-w-0">
                              <span className="block truncate text-sm font-medium text-neutral-900 hover:underline hover:decoration-neutral-300">
                                {campaign.name}
                              </span>
                              <CopyChips campaign={campaign} />
                            </div>
                          </div>
                          <div className="text-sm text-neutral-600">
                            {campaignStatusLabel(campaign.status)}
                          </div>
                          <div className="text-sm text-neutral-600">
                            {campaignPriorityLabel(campaign.priority)}
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-neutral-600">
                            <HealthGlyph health={campaign.health} />
                            {campaignHealthLabel(campaign.health)}
                          </div>
                          <div className="text-sm text-neutral-600">
                            {formatCampaignDate(campaign.start_date)}
                          </div>
                          <div className="text-sm text-neutral-600">
                            {formatCampaignDate(campaign.end_date)}
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-neutral-600">
                            <LeadGlyph label={campaign.owner_label} />
                            <span className="truncate">{campaign.owner_label || '—'}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          {view === 'board' ? (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="flex min-w-max gap-3 pb-2">
                {CAMPAIGN_STATUSES.map((column) => {
                  const items = ordered.filter(
                    (campaign) => normalizeCampaignStatus(campaign.status) === column
                  )
                  return (
                    <section
                      key={column}
                      className="flex w-[260px] shrink-0 flex-col rounded-xl bg-[#f4f5f7]/80"
                    >
                      <header className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-2.5">
                        <StatusGlyph status={column} />
                        <h3 className="text-[13px] font-medium text-neutral-700">
                          {campaignStatusLabel(column)}
                        </h3>
                        <span className="text-[12px] tabular-nums text-neutral-400">{items.length}</span>
                        <button
                          type="button"
                          onClick={() => createCampaign(column)}
                          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:bg-white hover:text-neutral-700"
                          aria-label={`New campaign in ${campaignStatusLabel(column)}`}
                          title="New campaign"
                        >
                          +
                        </button>
                      </header>
                      <ul className="flex flex-1 flex-col gap-1.5 px-2 pb-2">
                        {items.length === 0 ? (
                          <li className="rounded-lg border border-dashed border-neutral-200/80 px-3 py-6 text-center text-[12px] text-neutral-400">
                            No campaigns
                          </li>
                        ) : (
                          items.map((campaign) => {
                            const menuOpen =
                              rowMenu?.campaignId === campaign.id && rowMenu.kind === 'actions'
                            return (
                              <li
                                key={campaign.id}
                                className={`group relative rounded-[8px] border bg-white p-2.5 shadow-[0_1px_1px_rgba(16,24,40,0.04)] transition hover:border-neutral-300 ${
                                  selectedId === campaign.id
                                    ? 'border-[#5e6ad2]'
                                    : 'border-neutral-200/90'
                                }`}
                              >
                                <div className="mb-1.5 flex items-center gap-1.5">
                                  <span
                                    className="h-3.5 w-3.5 rounded-full"
                                    style={{ background: campaign.color || '#94a3b8' }}
                                  />
                                  <div className="ml-auto flex items-center gap-1">
                                    <HealthGlyph health={campaign.health} />
                                    <LeadGlyph label={campaign.owner_label} />
                                    <button
                                      type="button"
                                      className={`flex h-5 w-5 items-center justify-center rounded text-[11px] text-neutral-400 opacity-0 transition hover:bg-neutral-100 hover:text-neutral-700 group-hover:opacity-100 ${
                                        menuOpen ? 'opacity-100 bg-neutral-100' : ''
                                      }`}
                                      aria-label="Campaign actions"
                                      onClick={(e) =>
                                        openRowMenu(campaign.id, 'actions', e.currentTarget)
                                      }
                                    >
                                      ···
                                    </button>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openCampaign(campaign.id)}
                                  onDoubleClick={() => openCampaignPage(campaign.id)}
                                  className="block w-full text-left text-[13px] font-medium leading-snug text-neutral-900 hover:text-neutral-700 hover:underline hover:decoration-neutral-300"
                                >
                                  {campaign.name}
                                </button>
                                {campaign.summary ? (
                                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-neutral-500">
                                    {campaign.summary}
                                  </p>
                                ) : null}
                                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-neutral-500">
                                  {campaign.start_date || campaign.end_date ? (
                                    <span>
                                      {formatCampaignDate(campaign.start_date)} →{' '}
                                      {formatCampaignDate(campaign.end_date)}
                                    </span>
                                  ) : null}
                                  <span>{campaignPriorityLabel(campaign.priority)}</span>
                                </div>
                              </li>
                            )
                          })
                        )}
                      </ul>
                    </section>
                  )
                })}
              </div>
            </div>
          ) : null}

          {view === 'timeline' ? (
            <div ref={setTimelineScrollRef} className="min-h-0 flex-1 overflow-auto overscroll-contain">
              <div
                className="relative flex min-h-full flex-col"
                style={{ minWidth: listWidth + range.widthPx }}
                onMouseMove={onTimelineMouseMove}
                onMouseLeave={() => {
                  setHoverDate(null)
                  setHoverX(null)
                }}
              >
                <div
                  className="sticky top-0 z-30 flex shrink-0 border-b border-neutral-200/80 bg-[#f7f8f9]"
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
                      style={{ left: todayX, width: Math.max(dayWidth, 2) }}
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
                  className="relative flex min-h-0 flex-1 flex-col"
                  style={{ minHeight: gridHeight }}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <div
                    className="pointer-events-none absolute inset-0"
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
                      style={{ left: todayX, width: Math.max(dayWidth, 2) }}
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
                      left = dateToX(start, range)
                      width = Math.max(28, dateToX(end, range) + dayWidth - left)
                    }

                    return (
                      <div
                        key={campaign.id}
                        className={`group relative flex shrink-0 border-b border-neutral-100 ${
                          isSelected ? 'bg-white' : 'hover:bg-white/90'
                        }`}
                        style={{ height: ROW_HEIGHT }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setSelectedId(campaign.id)
                          setRowMenu({
                            campaignId: campaign.id,
                            kind: 'actions',
                            x: Math.min(e.clientX, window.innerWidth - 220),
                            y: e.clientY,
                            placement: 'below'
                          })
                        }}
                      >
                        {display.showList ? (
                          <div
                            className="sticky left-0 z-20 flex h-full min-w-0 items-center gap-1.5 overflow-hidden border-r border-neutral-200/80 bg-inherit px-3"
                            style={{ width: LABEL_WIDTH }}
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left"
                              onClick={() => {
                                setSelectedId(campaign.id)
                                setSidecarOpen(true)
                                setRowMenu(null)
                              }}
                              onDoubleClick={() => openCampaignPage(campaign.id)}
                              title={timelineRowTitle(campaign)}
                            >
                              <span
                                className="h-4 w-4 shrink-0 rounded-full"
                                style={{ background: campaign.color || '#94a3b8' }}
                              />
                              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-800 group-hover:underline group-hover:decoration-neutral-300">
                                {campaign.name}
                              </span>
                            </button>

                            <div className="flex shrink-0 items-center gap-0.5 pr-0.5 text-neutral-400">
                              {display.showStatus ? (
                                <GlyphButton
                                  label={`Status: ${campaignStatusLabel(campaign.status)}`}
                                  active={
                                    rowMenu?.campaignId === campaign.id && rowMenu.kind === 'status'
                                  }
                                  onClick={(el) => openRowMenu(campaign.id, 'status', el)}
                                >
                                  <StatusGlyph status={campaign.status} />
                                </GlyphButton>
                              ) : null}
                              {display.showPriority ? (
                                <GlyphButton
                                  label={`Priority: ${campaignPriorityLabel(campaign.priority)}`}
                                  active={
                                    rowMenu?.campaignId === campaign.id &&
                                    rowMenu.kind === 'priority'
                                  }
                                  onClick={(el) => openRowMenu(campaign.id, 'priority', el)}
                                >
                                  <PriorityGlyph priority={campaign.priority} />
                                </GlyphButton>
                              ) : null}
                              {display.showHealth ? (
                                <GlyphButton
                                  label={`Health: ${campaignHealthLabel(campaign.health)}`}
                                  active={
                                    rowMenu?.campaignId === campaign.id && rowMenu.kind === 'health'
                                  }
                                  onClick={(el) => openRowMenu(campaign.id, 'health', el)}
                                >
                                  <HealthGlyph health={campaign.health} />
                                </GlyphButton>
                              ) : null}
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
                                  setPinned((prev) => ({
                                    ...prev,
                                    [campaign.id]: !prev[campaign.id]
                                  }))
                                }
                              >
                                ★
                              </button>
                              <button
                                type="button"
                                className={`rounded p-0.5 opacity-0 hover:bg-neutral-100 group-hover:opacity-100 ${
                                  rowMenu?.campaignId === campaign.id && rowMenu.kind === 'actions'
                                    ? 'opacity-100 bg-neutral-100'
                                    : ''
                                }`}
                                title="More actions"
                                aria-label="More actions"
                                onClick={(e) => openRowMenu(campaign.id, 'actions', e.currentTarget)}
                              >
                                ···
                              </button>
                            </div>
                          </div>
                        ) : null}

                        <div
                          className="relative"
                          style={{ width: range.widthPx }}
                          onClick={() => {
                            setSelectedId(campaign.id)
                            setSidecarOpen(true)
                            setRowMenu(null)
                          }}
                        >
                          {start && end ? (
                            <div
                              className={`absolute top-1/2 h-7 -translate-y-1/2 cursor-grab overflow-clip rounded-md border bg-white active:cursor-grabbing ${
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
                                className="absolute inset-y-0 left-0 w-1.5 rounded-l-[5px]"
                                style={{ background: campaign.color || '#94a3b8' }}
                              />
                              {/* Stick the title to the visible left edge of the bar while zoomed/panned. */}
                              <span
                                className="sticky z-[1] inline-block max-w-full truncate py-1.5 pl-3.5 pr-2 text-[11px] font-medium text-neutral-700"
                                style={{ left: listWidth + 6 }}
                              >
                                {campaign.name}
                              </span>
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
                      className="flex shrink-0 border-b border-neutral-100/70"
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

                  {/* Stretch grid chrome to the viewport bottom (Linear-style). */}
                  <div className="flex min-h-0 flex-1">
                    {display.showList ? (
                      <div
                        className="sticky left-0 z-20 border-r border-neutral-200/80 bg-[#f7f8f9]"
                        style={{ width: LABEL_WIDTH }}
                      />
                    ) : null}
                    <div style={{ width: range.widthPx }} />
                  </div>

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
                          onClick={() => createCampaign()}
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
          ) : null}

          {view === 'calendar' ? (
            <CampaignCalendar
              campaigns={ordered.map((campaign) => ({
                ...campaign,
                start_date: draftDates[campaign.id]?.start ?? campaign.start_date,
                end_date: draftDates[campaign.id]?.end ?? campaign.end_date
              }))}
              grain={calendarGrain}
              cursor={calendarCursor}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id)
                setSidecarOpen(true)
                setRowMenu(null)
              }}
              onOpenPage={openCampaignPage}
            />
          ) : null}
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

      {rowMenu && menuCampaign ? (
        <FixedMenu
          key={`${rowMenu.campaignId}-${rowMenu.kind}`}
          x={rowMenu.x}
          y={rowMenu.y}
          placement={rowMenu.placement}
          onClose={() => setRowMenu(null)}
        >
          {rowMenu.kind === 'actions' ? (
            view === 'board' ? (
              <>
                <MenuItem
                  onClick={() => {
                    openCampaignPage(menuCampaign.id)
                  }}
                >
                  Open campaign page
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setRowMenu(null)
                    router.push(`/sales/outbound/editor/${menuCampaign.id}`)
                  }}
                >
                  Add copy
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    openCampaign(menuCampaign.id)
                  }}
                >
                  Open details panel
                </MenuItem>
                <div className="my-1 border-t border-neutral-100" />
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  Move to
                </div>
                {CAMPAIGN_STATUSES.map((value) => (
                  <MenuItem
                    key={value}
                    onClick={() => {
                      setRowMenu(null)
                      moveCampaignStatus(menuCampaign.id, value)
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <StatusGlyph status={value} />
                      {campaignStatusLabel(value)}
                      {normalizeCampaignStatus(menuCampaign.status) === value ? (
                        <span className="ml-auto text-neutral-400">✓</span>
                      ) : null}
                    </span>
                  </MenuItem>
                ))}
                <div className="my-1 border-t border-neutral-100" />
                <MenuItem
                  danger
                  onClick={() => {
                    void deleteCampaignRemote(menuCampaign.id).then(() => {
                      if (selectedId === menuCampaign.id) setSelectedId(null)
                      refresh()
                    }).catch(refresh)
                    setRowMenu(null)
                  }}
                >
                  Delete
                </MenuItem>
              </>
            ) : (
              <>
                <MenuItem
                  onClick={() => {
                    openCampaignPage(menuCampaign.id)
                  }}
                >
                  Open campaign page
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setRowMenu(null)
                    router.push(`/sales/outbound/editor/${menuCampaign.id}`)
                  }}
                >
                  Add copy
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setSelectedId(menuCampaign.id)
                    setSidecarOpen(true)
                    setRowMenu(null)
                  }}
                >
                  Open details panel
                </MenuItem>
                <div className="my-1 border-t border-neutral-100" />
                <MenuItem
                  onClick={() => {
                    void updateCampaign(menuCampaign.id, { status: 'active' }).then(refresh).catch(refresh)
                    setRowMenu(null)
                  }}
                >
                  Set status · Active
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void updateCampaign(menuCampaign.id, { priority: 2 }).then(refresh).catch(refresh)
                    setRowMenu(null)
                  }}
                >
                  Set priority · High
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void navigator.clipboard?.writeText(menuCampaign.name)
                    setRowMenu(null)
                  }}
                >
                  Copy name
                </MenuItem>
                <div className="my-1 border-t border-neutral-100" />
                <MenuItem
                  danger
                  onClick={() => {
                    void deleteCampaignRemote(menuCampaign.id).then(() => {
                      if (selectedId === menuCampaign.id) setSelectedId(null)
                      refresh()
                    }).catch(refresh)
                    setRowMenu(null)
                  }}
                >
                  Delete
                </MenuItem>
              </>
            )
          ) : null}

          {rowMenu.kind === 'status' ? (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Status
              </div>
              {CAMPAIGN_STATUSES.map((value) => (
                <MenuItem
                  key={value}
                  onClick={() => {
                    void updateCampaign(menuCampaign.id, { status: value }).then(refresh).catch(refresh)
                    setRowMenu(null)
                  }}
                >
                  <span className="flex items-center gap-2">
                    <StatusGlyph status={value} />
                    {campaignStatusLabel(value)}
                    {menuCampaign.status === value ? (
                      <span className="ml-auto text-neutral-400">✓</span>
                    ) : null}
                  </span>
                </MenuItem>
              ))}
            </>
          ) : null}

          {rowMenu.kind === 'priority' ? (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Priority
              </div>
              {PRIORITY_OPTIONS.map((value) => (
                <MenuItem
                  key={value}
                  onClick={() => {
                    void updateCampaign(menuCampaign.id, { priority: value }).then(refresh).catch(refresh)
                    setRowMenu(null)
                  }}
                >
                  <span className="flex items-center gap-2">
                    <PriorityGlyph priority={value} />
                    {campaignPriorityLabel(value)}
                    {menuCampaign.priority === value ? (
                      <span className="ml-auto text-neutral-400">✓</span>
                    ) : null}
                  </span>
                </MenuItem>
              ))}
            </>
          ) : null}

          {rowMenu.kind === 'health' ? (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Health
              </div>
              {CAMPAIGN_HEALTHS.map((value) => (
                <MenuItem
                  key={value}
                  onClick={() => {
                    void updateCampaign(menuCampaign.id, { health: value }).then(refresh).catch(refresh)
                    setRowMenu(null)
                  }}
                >
                  <span className="flex items-center gap-2">
                    <HealthGlyph health={value} />
                    {campaignHealthLabel(value)}
                    {menuCampaign.health === value ? (
                      <span className="ml-auto text-neutral-400">✓</span>
                    ) : null}
                  </span>
                </MenuItem>
              ))}
            </>
          ) : null}
        </FixedMenu>
      ) : null}
    </div>
  )
}

function GlyphButton({
  children,
  label,
  onClick,
  active
}: {
  children: ReactNode
  label: string
  onClick: (el: HTMLElement) => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={active}
      className={`flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-100 ${
        active ? 'bg-neutral-100 text-neutral-700' : ''
      }`}
      onClick={(e) => {
        e.stopPropagation()
        onClick(e.currentTarget)
      }}
    >
      {children}
    </button>
  )
}

function FixedMenu({
  children,
  x,
  y,
  placement = 'below',
  onClose
}: {
  children: ReactNode
  x: number
  y: number
  placement?: RowMenuPlacement
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let left: number
    let top: number
    if (placement === 'left') {
      // Side pop-out: sit just left of the three-dot trigger so the timeline bar stays clear.
      left = Math.max(8, x - rect.width - 6)
      top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
      // If there's no room on the left (narrow viewport), fall back to the right of the point.
      if (left <= 8 && x + 6 + rect.width < window.innerWidth - 8) {
        left = Math.min(x + 6, window.innerWidth - rect.width - 8)
      }
    } else {
      left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))
      top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
    }
    setPos({ left, top })
  }, [x, y, placement])

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] cursor-default"
        onClick={onClose}
        aria-label="Close menu"
      />
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[70] w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-xl"
        style={{
          left: pos?.left ?? x,
          top: pos?.top ?? y,
          visibility: pos ? 'visible' : 'hidden'
        }}
      >
        {children}
      </div>
    </>
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
      role="menuitem"
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
    <span className="inline-flex h-3.5 w-3.5 items-end gap-[1px]" title={campaignPriorityLabel(priority)}>
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
  return (
    <span className={`h-2.5 w-2.5 rounded-full border-2 ${color}`} title={campaignHealthLabel(health)} />
  )
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

function copyMetaBits(campaign: CompassCampaign): string[] {
  const bits = [
    campaign.offer_key,
    campaign.structure_id,
    ...(campaign.vertical_tags ?? []).slice(0, 1),
    ...(campaign.location_tags ?? []).slice(0, 1)
  ].filter(Boolean) as string[]
  if (campaign.experiment_status && campaign.experiment_status !== 'none') {
    const factor =
      campaign.experiment_factor && campaign.experiment_factor !== 'none'
        ? campaign.experiment_factor.toUpperCase()
        : 'EXP'
    bits.unshift(`${factor} · ${campaign.experiment_status}`)
  }
  return bits
}

function timelineRowTitle(campaign: CompassCampaign): string {
  const bits = copyMetaBits(campaign)
  const meta = bits.length ? ` · ${bits.join(' · ')}` : ''
  return `${campaign.name}${meta} - double-click to open page`
}

function CopyChips({ campaign }: { campaign: CompassCampaign }) {
  const bits = copyMetaBits(campaign)
  if (bits.length === 0) return null
  return (
    <div className="mt-0.5 flex min-w-0 flex-wrap gap-1">
      {bits.map((bit) => (
        <span
          key={bit}
          className="truncate rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500"
        >
          {bit}
        </span>
      ))}
    </div>
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
