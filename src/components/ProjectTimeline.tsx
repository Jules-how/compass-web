'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent
} from 'react'
import type { CompassBusinessFunction, CompassProjectWithStats } from '@/lib/types'
import { projectTimelineX, projectTimelineLabelWidth, projectTimelineTodayScroll } from '@/lib/project-timeline-interaction'
import {
  ZOOM_OPTIONS,
  addDays,
  buildHeaderModel,
  buildTimelineRange,
  clampDateOrder,
  dateToX,
  formatHoverDate,
  parseDateOnly,
  pxPerDay,
  toDateOnly,
  xToDate,
  zoomIn,
  zoomOut,
  type TimelineZoom
} from '@/lib/campaign-timeline'
import {
  DEFAULT_PROJECT_ICON_COLOR,
  formatProjectDate,
  normalizeProjectStatus,
  projectColorForFunction,
  projectHealthLabel,
  projectPriorityLabel,
  projectStatusLabel
} from '@/lib/project-pm'

const ROW_HEIGHT = 76
const EMPTY_ROWS = 10
const HEADER_HEIGHT = 52
const TODAY_ACCENT = '#6965db'
const BAR_TOP = 22
const BAR_HEIGHT = 26

type DraftDates = Record<string, { start: string; end: string }>

type CreateDrag = {
  projectId: string
  originDate: string
  start: string
  end: string
}

type BarDragMode = 'move' | 'resize-start' | 'resize-end'

type BarDrag = {
  projectId: string
  mode: BarDragMode
  originX: number
  start: string
  end: string
  moved: boolean
  draftStart: string
  draftEnd: string
}

/** Resolve displayed bar dates when only start or end is set. */
function resolveBarDates(
  start: Date | null,
  end: Date | null
): { start: string; end: string } | null {
  if (start && end) return { start: toDateOnly(start), end: toDateOnly(end) }
  if (start) return { start: toDateOnly(start), end: toDateOnly(addDays(start, 13)) }
  if (end) return { start: toDateOnly(addDays(end, -13)), end: toDateOnly(end) }
  return null
}

function statusDotClass(status: string): string {
  switch (normalizeProjectStatus(status)) {
    case 'in_progress':
      return 'border-[#f2c94c] bg-[#f2c94c]/30'
    case 'planned':
      return 'border-stone-400 bg-stone-400/20'
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

export type ProjectTimelineHandle = {
  scrollToToday: (behavior?: ScrollBehavior) => void
}

export const ProjectTimeline = forwardRef<
  ProjectTimelineHandle,
  {
    projects: CompassProjectWithStats[]
    clientById: Record<string, { id: string; name: string }>
    functionById?: Record<string, CompassBusinessFunction>
    zoom: TimelineZoom
    onZoomChange: (zoom: TimelineZoom) => void
    onDatesChange?: (projectId: string, start: string, end: string) => Promise<void> | void
    onOpenProject?: (projectId: string) => void
    showToolbar?: boolean
  }
>(function ProjectTimeline(
  {
    projects,
    clientById,
    functionById = {},
    zoom,
    onZoomChange,
    onDatesChange,
    onOpenProject,
    showToolbar = false
  },
  ref
) {
  const router = useRouter()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const didCenterToday = useRef(false)
  const zoomAnchorRef = useRef<{ date: Date; offsetX: number } | null>(null)
  const createDragRef = useRef<CreateDrag | null>(null)
  const barDragRef = useRef<BarDrag | null>(null)
  const suppressBarClickRef = useRef(false)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverRowId, setHoverRowId] = useState<string | null>(null)
  const [draftDates, setDraftDates] = useState<DraftDates>({})
  const [createDrag, setCreateDrag] = useState<CreateDrag | null>(null)
  const [barDrag, setBarDrag] = useState<BarDrag | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [labelWidth, setLabelWidth] = useState(320)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setLabelWidth(projectTimelineLabelWidth(el.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const range = useMemo(
    () =>
      buildTimelineRange(
        projects.flatMap((project) => [
          project.start_date,
          project.target_date
        ]),
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
      el.scrollTo({ left: projectTimelineTodayScroll(todayX, el.clientWidth, labelWidth), behavior })
    },
    [todayX, labelWidth]
  )

  useImperativeHandle(ref, () => ({ scrollToToday }), [scrollToToday])

  useEffect(() => {
    if (didCenterToday.current) return
    scrollToToday('auto')
    didCenterToday.current = true
  }, [scrollToToday])

  useEffect(() => {
    didCenterToday.current = false
  }, [zoom])

  useEffect(() => {
    const anchor = zoomAnchorRef.current
    if (!anchor) return
    const el = scrollRef.current
    if (!el) return
    const nextX = dateToX(anchor.date, range, zoom)
    el.scrollLeft = Math.max(0, nextX - anchor.offsetX)
    zoomAnchorRef.current = null
  }, [range, zoom])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      if (!(e.target instanceof Element) || !scrollRef.current?.contains(e.target)) return
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const key = e.key.toLowerCase()
      if (key === 't') scrollToToday('smooth')
      if (key === 'y' || key === 'q' || key === 'm' || key === 'w') {
        onZoomChange(key === 'y' ? 'year' : key === 'q' ? 'quarter' : key === 'm' ? 'month' : 'week')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onZoomChange, scrollToToday])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const scroller = el

    function onWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const next = e.deltaY < 0 ? zoomIn(zoom) : zoomOut(zoom)
      if (next === zoom) return

      const scrollLeft = scroller.scrollLeft
      const rect = scroller.getBoundingClientRect()
      const x = projectTimelineX(e.clientX, rect.left, scrollLeft, labelWidth)
      const date = xToDate(Math.max(0, x), range, zoom)
      zoomAnchorRef.current = {
        date,
        offsetX: Math.max(0, e.clientX - rect.left - labelWidth)
      }
      onZoomChange(next)
    }

    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [onZoomChange, range, zoom, labelWidth])

  function readTimelineX(clientX: number): number {
    const el = scrollRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return projectTimelineX(clientX, rect.left, el.scrollLeft, labelWidth)
  }

  function onTimelineMouseMove(e: MouseEvent<HTMLDivElement>) {
    const x = readTimelineX(e.clientX)
    const viewportLeft = scrollRef.current?.getBoundingClientRect().left ?? 0
    if (x < 0 || e.clientX < viewportLeft + labelWidth) {
      setHoverDate(null)
      setHoverX(null)
      return
    }
    setHoverX(x)
    setHoverDate(xToDate(x, range, zoom))
  }

  async function persistDates(projectId: string, start: string, end: string) {
    const ordered = clampDateOrder(start, end)
    setSaveError(null)
    setSavingId(projectId)
    setDraftDates((prev) => ({ ...prev, [projectId]: ordered }))
    try {
      await onDatesChange?.(projectId, ordered.start, ordered.end)
      setDraftDates((prev) => {
        const next = { ...prev }
        delete next[projectId]
        return next
      })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save project dates. Your previous dates have been restored.')
      setDraftDates((prev) => {
        const next = { ...prev }
        delete next[projectId]
        return next
      })
    } finally {
      setSavingId(null)
    }
  }

  function beginCreateDrag(projectId: string, clientX: number) {
    const x = Math.max(0, readTimelineX(clientX))
    const date = toDateOnly(xToDate(x, range, zoom))
    const next: CreateDrag = {
      projectId,
      originDate: date,
      start: date,
      end: date
    }
    createDragRef.current = next
    setCreateDrag(next)
    setDraftDates((prev) => ({ ...prev, [projectId]: { start: date, end: date } }))
    setHoverRowId(projectId)
  }

  function updateCreateDrag(clientX: number) {
    const current = createDragRef.current
    if (!current) return
    const x = Math.max(0, readTimelineX(clientX))
    const date = toDateOnly(xToDate(x, range, zoom))
    const ordered = clampDateOrder(
      date < current.originDate ? date : current.originDate,
      date < current.originDate ? current.originDate : date
    )
    const next = { ...current, start: ordered.start, end: ordered.end }
    createDragRef.current = next
    setCreateDrag(next)
    setDraftDates((prev) => ({ ...prev, [current.projectId]: ordered }))
    setHoverX(x)
    setHoverDate(xToDate(x, range, zoom))
  }

  async function endCreateDrag() {
    const current = createDragRef.current
    createDragRef.current = null
    setCreateDrag(null)
    if (!current) return
    await persistDates(current.projectId, current.start, current.end)
  }

  function beginBarDrag(
    projectId: string,
    mode: BarDragMode,
    clientX: number,
    start: string,
    end: string
  ) {
    const next: BarDrag = {
      projectId,
      mode,
      originX: clientX,
      start,
      end,
      moved: false,
      draftStart: start,
      draftEnd: end
    }
    barDragRef.current = next
    setBarDrag(next)
    setHoverRowId(projectId)
  }

  function updateBarDrag(clientX: number) {
    const current = barDragRef.current
    if (!current) return
    const deltaDays = Math.round((clientX - current.originX) / pxPerDay(zoom))

    const startDate = parseDateOnly(current.start)
    const endDate = parseDateOnly(current.end)
    if (!startDate || !endDate) return

    let nextStart = new Date(startDate)
    let nextEnd = new Date(endDate)
    if (current.mode === 'move') {
      nextStart = addDays(startDate, deltaDays)
      nextEnd = addDays(endDate, deltaDays)
    } else if (current.mode === 'resize-start') {
      nextStart = addDays(startDate, deltaDays)
      if (nextStart > endDate) nextStart = new Date(endDate)
    } else {
      nextEnd = addDays(endDate, deltaDays)
      if (nextEnd < startDate) nextEnd = new Date(startDate)
    }

    const ordered = {
      start: toDateOnly(nextStart),
      end: toDateOnly(nextEnd)
    }
    barDragRef.current = {
      ...current,
      moved: current.moved || deltaDays !== 0,
      draftStart: ordered.start,
      draftEnd: ordered.end
    }
    setDraftDates((prev) => ({ ...prev, [current.projectId]: ordered }))

    const x = Math.max(0, readTimelineX(clientX))
    setHoverX(x)
    setHoverDate(xToDate(x, range, zoom))
  }

  async function endBarDrag() {
    const current = barDragRef.current
    barDragRef.current = null
    setBarDrag(null)
    if (!current) return
    suppressBarClickRef.current = current.moved
    const start = current.draftStart
    const end = current.draftEnd
    if (start !== current.start || end !== current.end) {
      await persistDates(current.projectId, start, end)
    } else {
      setDraftDates((prev) => {
        const next = { ...prev }
        delete next[current.projectId]
        return next
      })
    }
  }

  const isDragging = Boolean(createDrag || barDrag)
  const barDragActive = barDrag !== null
  const createDragActive = createDrag !== null

  function cancelDrag() {
    const projectId = createDragRef.current?.projectId ?? barDragRef.current?.projectId
    createDragRef.current = null
    barDragRef.current = null
    setCreateDrag(null)
    setBarDrag(null)
    if (projectId) setDraftDates(previous => {
      const next = { ...previous }
      delete next[projectId]
      return next
    })
  }

  useEffect(() => {
    if (!createDragActive) return

    function onMove(e: PointerEvent) {
      updateCreateDrag(e.clientX)
    }
    function onUp() {
      void endCreateDrag()
    }
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') cancelDrag() }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cancelDrag)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', cancelDrag)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drag handlers close over latest range/zoom via refs+state setters
  }, [createDragActive, range, zoom])

  useEffect(() => {
    if (!barDragActive) return

    function onMove(e: PointerEvent) {
      e.preventDefault()
      updateBarDrag(e.clientX)
    }
    function onUp() {
      void endBarDrag()
    }
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') cancelDrag() }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cancelDrag)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', cancelDrag)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drag handlers close over latest range/zoom via refs+state setters
  }, [barDragActive, range, zoom])

  return (
    <div className="projects-timeline flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-lg border border-neutral-200/80 bg-[#fafafa]">
      {saveError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p> : null}
      {showToolbar ? (
        <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-neutral-200/80 bg-white px-3">
          <div className="text-[12px] text-neutral-500">
            <span className="font-medium text-neutral-700">{projects.length}</span> project
            {projects.length === 1 ? '' : 's'}
          </div>
          <TimelineZoomControls
            zoom={zoom}
            onZoomChange={onZoomChange}
            onToday={() => scrollToToday('smooth')}
          />
        </div>
      ) : null}

      <div ref={scrollRef} role="region" aria-label="Project timeline" tabIndex={0} className="projects-timeline-scroll min-h-0 flex-1 overflow-auto overscroll-contain">
        <div
          ref={contentRef}
          className="relative"
          style={{ minWidth: labelWidth + range.widthPx, minHeight: '100%' }}
          onMouseMove={onTimelineMouseMove}
          onMouseLeave={() => {
            if (isDragging) return
            setHoverDate(null)
            setHoverX(null)
            setHoverRowId(null)
          }}
        >
          <div
            className="sticky top-0 z-30 flex border-b border-neutral-200/80 bg-stone-50"
            style={{ height: HEADER_HEIGHT }}
          >
            <div
              className="sticky left-0 z-40 flex shrink-0 items-end border-r border-neutral-200/80 bg-stone-50 px-3 pb-2 text-[12px] font-medium text-neutral-500"
              style={{ width: labelWidth }}
            >
              Projects
              <span className="ml-2 tabular-nums text-neutral-400">{projects.length}</span>
            </div>
            <div className="relative shrink-0" style={{ width: range.widthPx, height: HEADER_HEIGHT }}>
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
                  <div className="truncate px-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-500">
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
                  <div className="px-1 text-[11px] tabular-nums text-neutral-400">{tick.label}</div>
                </div>
              ))}
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10"
                style={{
                  left: todayX,
                  width: Math.max(pxPerDay(zoom), 2),
                  background: `${TODAY_ACCENT}26`
                }}
              >
                <div className="absolute inset-y-0 left-0 w-px" style={{ background: TODAY_ACCENT }} />
                <span
                  className="absolute left-1/2 top-1 z-20 -translate-x-1/2 whitespace-nowrap rounded-[4px] px-1.5 py-[2px] text-[11px] font-semibold text-white"
                  style={{ background: TODAY_ACCENT }}
                >
                  {range.today
                    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    .toUpperCase()}
                </span>
              </div>
              {hoverDate && hoverX !== null && !isDragging ? (
                <div className="pointer-events-none absolute bottom-0 top-0 z-20" style={{ left: hoverX }}>
                  <div className="absolute inset-y-0 w-px bg-neutral-400/50" />
                  <span className="absolute left-1/2 top-1 z-30 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-white">
                    {formatHoverDate(hoverDate)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="relative" style={{ minHeight: gridHeight }}>
            <div
              className="pointer-events-none absolute bottom-0 top-0"
              style={{ left: labelWidth, width: range.widthPx }}
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
                  background: `${TODAY_ACCENT}1a`
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 w-px"
                  style={{ background: `${TODAY_ACCENT}80` }}
                />
              </div>
            </div>

            {projects.map((project) => {
              const draft = draftDates[project.id]
              const start = parseDateOnly(draft?.start ?? project.start_date)
              const end = parseDateOnly(draft?.end ?? project.target_date)
              const accent = projectColorForFunction(
                project.business_function_id ? functionById[project.business_function_id] : null
              ) || DEFAULT_PROJECT_ICON_COLOR
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
              const resolvedDates = resolveBarDates(start, end)
              const isCreating = createDrag?.projectId === project.id
              const isBarDragging = barDrag?.projectId === project.id
              const showPlus =
                !hasDates &&
                !isCreating &&
                hoverRowId === project.id &&
                hoverX !== null &&
                hoverDate !== null

              return (
                <div
                  key={project.id}
                  className="group relative flex border-b border-transparent hover:bg-white/80"
                  style={{ height: ROW_HEIGHT }}
                  onMouseEnter={() => setHoverRowId(project.id)}
                  onMouseLeave={() => {
                    if (createDragRef.current?.projectId === project.id) return
                    if (barDragRef.current?.projectId === project.id) return
                    setHoverRowId((current) => (current === project.id ? null : current))
                  }}
                >
                  <div
                    className="projects-timeline-label sticky left-0 z-20 flex shrink-0 items-center gap-3 border-r border-neutral-200/80 bg-[#fafafa] px-4"
                    style={{ width: labelWidth }}
                  >
                    {onOpenProject ? (
                      <button
                        type="button"
                        onClick={() => onOpenProject(project.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        title={project.name}
                      >
                        <ProjectIcon color={accent} />
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-neutral-800">
                          {project.name}
                        </span>
                      </button>
                    ) : (
                      <Link
                        href={`/projects/${project.id}`}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        title={project.name}
                      >
                        <ProjectIcon color={accent} />
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-neutral-800">
                          {project.name}
                        </span>
                      </Link>
                    )}
                    <div className="projects-timeline-properties flex shrink-0 items-center gap-3 text-neutral-400">
                      <span
                        className={`h-3 w-3 rounded-full border-2 ${statusDotClass(project.status)}`}
                        title={projectStatusLabel(project.status)}
                      />
                      <span className={health.className} title={health.title}>
                        <HealthGlyph health={project.health || 'no_updates'} />
                      </span>
                      <span
                        className="hidden text-[11px] text-neutral-400 sm:inline"
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

                  <div
                    className={`relative shrink-0 ${onDatesChange ? "cursor-crosshair" : ""}`}
                    style={{ width: range.widthPx }}
                    onPointerDown={(e) => {
                      if (hasDates || e.button !== 0 || !onDatesChange || savingId || project.id.startsWith('project-temp-')) return
                      e.preventDefault()
                      beginCreateDrag(project.id, e.clientX)
                    }}
                  >
                    {hasDates || isCreating ? (
                      <div
                        className="absolute"
                        style={{
                          left,
                          width: Math.max(width, 88),
                          top: 8,
                          height: ROW_HEIGHT - 14
                        }}
                      >
                        <span
                          className={`mb-1 block truncate pr-1 text-[14px] font-medium leading-5 text-neutral-700 ${
                            resolvedDates && !isCreating ? 'cursor-grab active:cursor-grabbing' : ''
                          }`}
                          style={{ width: 'max-content', maxWidth: 320 }}
                          title={project.name}
                          onPointerDown={(e) => {
                            if (!resolvedDates || isCreating || e.button !== 0 || !onDatesChange || savingId) return
                            e.preventDefault()
                            e.stopPropagation()
                            beginBarDrag(
                              project.id,
                              'move',
                              e.clientX,
                              resolvedDates.start,
                              resolvedDates.end
                            )
                          }}
                        >
                          {project.name}
                        </span>
                        {isCreating ? (
                          <span
                            className="relative block overflow-hidden rounded-[6px] border border-[#6965db] bg-white shadow-[0_0_0_1px_rgba(105,101,219,0.2)]"
                            style={{ width, height: BAR_HEIGHT }}
                          >
                            <span
                              className="absolute inset-y-0 left-0 w-[3px] rounded-l-[5px]"
                              style={{ background: accent }}
                            />
                          </span>
                        ) : resolvedDates ? (
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={`${project.name}: ${formatProjectDate(resolvedDates.start)} to ${formatProjectDate(resolvedDates.end)}. Open project to edit dates.`}
                            className={`relative block touch-none overflow-hidden rounded-[6px] border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition select-none ${
                              isBarDragging
                                ? 'cursor-grabbing border-[#6965db] shadow-[0_0_0_1px_rgba(105,101,219,0.28)]'
                                : 'cursor-grab border-neutral-300 group-hover:border-neutral-400 active:cursor-grabbing'
                            }`}
                            style={{ width, height: BAR_HEIGHT }}
                            title={`${formatProjectDate(resolvedDates.start)} → ${formatProjectDate(resolvedDates.end)} · Drag to move`}
                            onPointerDown={(e) => {
                              if (e.button !== 0 || !onDatesChange || savingId) return
                              e.preventDefault()
                              e.stopPropagation()
                              beginBarDrag(
                                project.id,
                                'move',
                                e.clientX,
                                resolvedDates.start,
                                resolvedDates.end
                              )
                            }}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              if (suppressBarClickRef.current) {
                                suppressBarClickRef.current = false
                                return
                              }
                              if (onOpenProject) onOpenProject(project.id)
                              else router.push(`/projects/${project.id}`)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                if (onOpenProject) onOpenProject(project.id)
                                else router.push(`/projects/${project.id}`)
                              }
                            }}
                          >
                            <div
                              className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize"
                              onPointerDown={(e) => {
                                if (e.button !== 0 || !onDatesChange || savingId) return
                                e.preventDefault()
                                e.stopPropagation()
                                beginBarDrag(
                                  project.id,
                                  'resize-start',
                                  e.clientX,
                                  resolvedDates.start,
                                  resolvedDates.end
                                )
                              }}
                            />
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
                            <div
                              className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize"
                              onPointerDown={(e) => {
                                if (e.button !== 0 || !onDatesChange || savingId) return
                                e.preventDefault()
                                e.stopPropagation()
                                beginBarDrag(
                                  project.id,
                                  'resize-end',
                                  e.clientX,
                                  resolvedDates.start,
                                  resolvedDates.end
                                )
                              }}
                            />
                          </div>
                        ) : null}
                        {savingId === project.id ? (
                          <span role="status" className="mt-1 block text-[11px] text-neutral-500">Saving…</span>
                        ) : null}
                      </div>
                    ) : null}

                    {showPlus && hoverX !== null && hoverDate ? (
                      <div
                        className="pointer-events-none absolute z-20 -translate-x-1/2"
                        style={{ left: hoverX, top: BAR_TOP - 18 }}
                      >
                        <div className="mb-1.5 whitespace-nowrap rounded-md bg-[#6965db] px-1.5 py-0.5 text-[11px] font-medium text-white shadow-sm">
                          {hoverDate.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                        <div className="mx-auto flex h-5 w-5 items-center justify-center rounded-full border border-neutral-300 bg-white text-[14px] leading-none text-neutral-600 shadow-sm">
                          +
                        </div>
                      </div>
                    ) : null}

                    {(isCreating || isBarDragging) && hoverDate ? (
                      <div
                        className="pointer-events-none absolute z-20 -translate-x-1/2"
                        style={{ left: hoverX ?? left, top: 4 }}
                      >
                        <div className="whitespace-nowrap rounded-md bg-[#6965db] px-1.5 py-0.5 text-[11px] font-medium text-white shadow-sm">
                          {hoverDate.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}

            {Array.from({ length: Math.max(0, EMPTY_ROWS - projects.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex border-b border-neutral-100/40"
                style={{ height: ROW_HEIGHT }}
              >
                <div
                  className="sticky left-0 z-20 shrink-0 border-r border-neutral-200/80 bg-stone-50"
                  style={{ width: labelWidth }}
                />
                <div style={{ width: range.widthPx }} />
              </div>
            ))}

            {projects.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-xl border border-neutral-200 bg-white/95 px-5 py-4 text-center shadow-sm backdrop-blur">
                  <p className="text-sm font-medium text-neutral-800">No projects on the timeline</p>
                  <p className="mt-1 max-w-xs text-xs text-neutral-500">
                    Create a project to begin, or clear your search and filters.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
})

export function TimelineZoomControls({
  zoom,
  onZoomChange,
  onToday
}: {
  zoom: TimelineZoom
  onZoomChange: (zoom: TimelineZoom) => void
  onToday: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToday}
        className="h-8 rounded-md border border-neutral-200 bg-white px-2.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Today
      </button>
      <label className="relative">
        <select
          aria-label="Timeline zoom"
          value={zoom}
          onChange={(e) => onZoomChange(e.target.value as TimelineZoom)}
          className="h-8 appearance-none rounded-md border border-neutral-200 bg-white py-0 pl-2.5 pr-7 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {ZOOM_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400">
          ▾
        </span>
      </label>
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
