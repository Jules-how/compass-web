'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import {
  CALENDAR_DAY_COL_MIN_PX,
  CALENDAR_EVENT_HEIGHT,
  CALENDAR_GUTTER_PX,
  CALENDAR_HOUR_HEIGHT,
  CALENDAR_HOURS,
  CALENDAR_SCROLL_HOUR,
  WEEKDAY_LABELS,
  datedGoLiveCampaigns,
  dayFromMonthGridPoint,
  eventOffsetPx,
  formatPeriodLabel,
  goLiveAtFromSlot,
  goLiveFallsInPeriod,
  hourLabel,
  layoutWeekBars,
  layoutTimedEvents,
  minutesFromMidnight,
  monthWeeks,
  nextOpenGoLiveAt,
  periodRange,
  slotFromGridPoint,
  toDateOnly,
  weekDays,
  type CalendarGrain
} from '@/lib/campaign-calendar'
import { addDays, startOfDay } from '@/lib/campaign-timeline'
import {
  campaignLeadCountLabel,
  formatGoLiveAt,
  formatGoLiveTime,
  openerModeLabel,
  type CompassCampaign
} from '@/lib/campaigns'
import {
  INVENTORY_DRAG_MIME,
  campaignReadiness,
  parseInventoryDrag,
  type InventoryCard
} from '@/lib/campaign-queue'

type Props = {
  campaigns: CompassCampaign[]
  grain: CalendarGrain
  cursor: Date
  selectedId: string | null
  draftGoLiveAt?: string | null
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
  onCreateSlot: (goLiveAt: string) => void
  onMoveCampaign: (id: string, goLiveAt: string) => void
  onCursorChange: (day: Date) => void
  onDropInventory?: (goLiveAt: string, card: InventoryCard) => void
}

function inventoryDropHandlers(
  goLiveAt: string,
  onDropInventory?: (goLiveAt: string, card: InventoryCard) => void
) {
  if (!onDropInventory) return {}
  return {
    onDragOver: (event: ReactDragEvent) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    },
    onDrop: (event: ReactDragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const card =
        parseInventoryDrag(event.dataTransfer.getData(INVENTORY_DRAG_MIME)) ||
        parseInventoryDrag(event.dataTransfer.getData('text/plain'))
      if (card) onDropInventory(goLiveAt, card)
    }
  }
}

function campaignChipBlocked(campaign: CompassCampaign): boolean {
  const status = campaign.status
  if (status === 'active' || status === 'completed' || status === 'cancelled') return false
  return !campaignReadiness({
    cohort: campaign.wave_cohort_count ?? 0,
    copy_status: campaign.copy_status || 'none',
    bound: Boolean((campaign.instantly_campaign_id || '').trim())
  }).ready
}

type CalendarDrag = {
  id: string
  pointerId: number
  originX: number
  originY: number
  clientX: number
  clientY: number
  goLiveAt: string
  liveGoLiveAt: string
  moved: boolean
}

export function CampaignCalendar({
  campaigns,
  grain,
  cursor,
  selectedId,
  draftGoLiveAt,
  onSelect,
  onOpenPage,
  onCreateSlot,
  onMoveCampaign,
  onCursorChange,
  onDropInventory
}: Props) {
  const items = useMemo(
    () => datedGoLiveCampaigns(campaigns.map((c) => ({ id: c.id, go_live_at: c.go_live_at }))),
    [campaigns]
  )
  const byId = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns])
  const occupiedIsos = useMemo(() => campaigns.map((c) => c.go_live_at), [campaigns])
  const { start, end } = periodRange(cursor, grain)
  const inPeriod = campaigns.filter((c) => goLiveFallsInPeriod(c.go_live_at, start, end))
  const today = startOfDay(new Date())
  const todayKey = toDateOnly(today)

  function openSlot(day: Date, hour: number) {
    onCreateSlot(nextOpenGoLiveAt(day, hour, occupiedIsos))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-neutral-900">
          {formatPeriodLabel(cursor, grain)}
        </h2>
        <p className="text-[12px] tabular-nums text-neutral-400">
          {inPeriod.length} campaign{inPeriod.length === 1 ? '' : 's'}
        </p>
      </div>

      {grain === 'month' ? (
        <MonthGrid
          cursor={cursor}
          items={items}
          byId={byId}
          todayKey={todayKey}
          selectedId={selectedId}
          occupiedIsos={occupiedIsos}
          onSelect={onSelect}
          onOpenPage={onOpenPage}
          onCreateSlot={openSlot}
          onMoveCampaign={onMoveCampaign}
          onCursorChange={onCursorChange}
          onDropInventory={onDropInventory}
        />
      ) : null}

      {grain === 'week' ? (
        <WeekGrid
          cursor={cursor}
          byId={byId}
          todayKey={todayKey}
          selectedId={selectedId}
          draftGoLiveAt={draftGoLiveAt}
          occupiedIsos={occupiedIsos}
          onSelect={onSelect}
          onOpenPage={onOpenPage}
          onCreateSlot={openSlot}
          onMoveCampaign={onMoveCampaign}
          onCursorChange={onCursorChange}
          onDropInventory={onDropInventory}
        />
      ) : null}

      {grain === 'day' ? (
        <DayList
          cursor={cursor}
          campaigns={campaigns}
          selectedId={selectedId}
          draftGoLiveAt={draftGoLiveAt}
          occupiedIsos={occupiedIsos}
          onSelect={onSelect}
          onOpenPage={onOpenPage}
          onCreateSlot={openSlot}
          onMoveCampaign={onMoveCampaign}
          onCursorChange={onCursorChange}
          onDropInventory={onDropInventory}
        />
      ) : null}
    </div>
  )
}

function campaignPillTags(campaign: CompassCampaign): string[] {
  const tags: string[] = []
  const opener = openerModeLabel(campaign.opener_mode)
  if (opener) tags.push(opener)
  if (campaign.offer_key) tags.push(campaign.offer_key)
  const leads = campaignLeadCountLabel(campaign)
  if (leads) tags.push(leads)
  for (const label of campaign.labels ?? []) {
    if (label && !tags.includes(label)) tags.push(label)
  }
  return tags.slice(0, 3)
}

function EventChip({
  campaign,
  selected,
  compact,
  dragging,
  onSelect,
  onOpenPage,
  onPointerDown
}: {
  campaign: CompassCampaign
  selected: boolean
  compact?: boolean
  dragging?: boolean
  onSelect: () => void
  onOpenPage: () => void
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  const time = formatGoLiveTime(campaign.go_live_at)
  const color = campaign.color || '#E5570A'
  const tags = campaignPillTags(campaign)
  const leadTag = campaignLeadCountLabel(campaign)
  const blocked = campaignChipBlocked(campaign)
  return (
    <button
      type="button"
      className={`relative pointer-events-auto flex w-full min-w-0 overflow-hidden rounded-xl border text-left shadow-soft ${
        compact
          ? 'h-[22px] items-center gap-1.5 px-1.5 text-[11px]'
          : 'h-full flex-col justify-center gap-0.5 py-1.5 pl-3.5 pr-2.5'
      } ${
        selected
          ? 'border-[var(--compass-accent)]/40 bg-white ring-1 ring-[var(--compass-accent)]/25'
          : blocked
            ? 'border-stone-200 bg-stone-100'
            : 'border-stone-200/90 bg-white hover:border-stone-300'
      } ${dragging ? 'cursor-grabbing opacity-90 shadow-lift' : 'cursor-grab'}`}
      title={`${campaign.name} · ${formatGoLiveAt(campaign.go_live_at)}${leadTag ? ` · ${leadTag}` : ''}${blocked ? ' · not ready' : ''}`}
      onClick={onSelect}
      onDoubleClick={onOpenPage}
      onPointerDown={onPointerDown}
    >
      {compact ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      ) : (
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      )}
      {time ? (
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-neutral-500">{time}</span>
      ) : null}
      <span
        className={`min-w-0 font-medium ${
          blocked ? 'text-neutral-500' : 'text-neutral-800'
        } ${compact ? 'truncate text-[11px]' : 'truncate text-[12px] leading-snug'}`}
      >
        {campaign.name}
      </span>
      {compact && leadTag ? (
        <span className="ml-auto shrink-0 rounded-full bg-stone-100 px-1.5 py-px text-[9px] font-medium tabular-nums text-neutral-500">
          {campaign.wave_cohort_count}
        </span>
      ) : null}
      {!compact && tags.length > 0 ? (
        <span className="mt-0.5 flex min-w-0 flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="max-w-full truncate rounded-full bg-stone-100 px-1.5 py-px text-[10px] font-medium text-neutral-600"
            >
              {tag}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  )
}

function DragGhost({
  campaign,
  goLiveAt,
  x,
  y,
  compact
}: {
  campaign: CompassCampaign
  goLiveAt: string
  x: number
  y: number
  compact?: boolean
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="pointer-events-none fixed z-[90] w-[268px]"
      style={{ left: x + 12, top: y - 12 }}
    >
      <div className={compact ? 'h-[22px]' : 'h-[72px]'}>
        <EventChip
          campaign={{ ...campaign, go_live_at: goLiveAt }}
          selected
          compact={compact}
          dragging
          onSelect={() => undefined}
          onOpenPage={() => undefined}
        />
      </div>
    </div>,
    document.body
  )
}

function MonthGrid({
  cursor,
  items,
  byId,
  todayKey,
  selectedId,
  occupiedIsos,
  onSelect,
  onOpenPage,
  onCreateSlot,
  onMoveCampaign,
  onCursorChange,
  onDropInventory
}: {
  cursor: Date
  items: ReturnType<typeof datedGoLiveCampaigns>
  byId: Map<string, CompassCampaign>
  todayKey: string
  selectedId: string | null
  occupiedIsos: Array<string | null | undefined>
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
  onCreateSlot: (day: Date, hour: number) => void
  onMoveCampaign: (id: string, goLiveAt: string) => void
  onCursorChange: (day: Date) => void
  onDropInventory?: (goLiveAt: string, card: InventoryCard) => void
}) {
  const weeks = monthWeeks(cursor)
  const month = cursor.getMonth()
  const weeksRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<CalendarDrag | null>(null)
  const gridStart = weeks[0]?.[0]
  const dragged = drag ? byId.get(drag.id) : null

  function liveDayFromPoint(clientX: number, clientY: number, ignoreIso: string) {
    const root = weeksRef.current
    if (!root || !gridStart) return ignoreIso
    const day = dayFromMonthGridPoint(gridStart, root.getBoundingClientRect(), clientX, clientY)
    const hour = new Date(ignoreIso).getHours()
    return nextOpenGoLiveAt(day, hour, occupiedIsos, ignoreIso)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-stone-50">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-neutral-400"
          >
            {label}
          </div>
        ))}
      </div>
      <div ref={weeksRef} className="grid min-h-0 flex-1 grid-rows-6">
        {weeks.map((week, wi) => {
          const bars = layoutWeekBars(week, items)
          const laneCount = bars.reduce((max, bar) => Math.max(max, bar.lane + 1), 0)
          return (
            <div
              key={wi}
              className="relative grid min-h-[88px] grid-cols-7 border-t border-neutral-100"
            >
              {week.map((day) => {
                const key = toDateOnly(day)
                const inMonth = day.getMonth() === month
                const isToday = key === todayKey
                const dropHere =
                  drag?.moved && toDateOnly(new Date(drag.liveGoLiveAt)) === key
                return (
                  <button
                    type="button"
                    key={key}
                    data-cal-day={key}
                    onClick={() => onCreateSlot(day, 9)}
                    {...inventoryDropHandlers(nextOpenGoLiveAt(day, 9, occupiedIsos), onDropInventory)}
                    className={`group/slot w-full border-r border-neutral-100 text-left last:border-r-0 hover:bg-[var(--compass-accent)]/[0.04] ${
                      isToday ? 'bg-[#e85d2a]/[0.06]' : ''
                    } ${dropHere ? 'bg-[var(--compass-accent)]/[0.08]' : ''}`}
                  >
                    <div
                      className={`px-2 pt-1.5 text-[12px] tabular-nums ${
                        isToday
                          ? 'font-semibold text-[#e85d2a]'
                          : inMonth
                            ? 'text-neutral-600'
                            : 'text-neutral-300'
                      }`}
                    >
                      {day.getDate()}
                    </div>
                  </button>
                )
              })}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-1 top-7 grid grid-cols-7 px-0.5"
                style={{ gridTemplateRows: `repeat(${Math.max(laneCount, 1)}, 22px)` }}
              >
                {bars.map((bar) => {
                  const campaign = byId.get(bar.campaignId)
                  if (!campaign) return null
                  const dragging = drag?.id === campaign.id
                  return (
                    <div
                      key={`${campaign.id}-${bar.colStart}-${wi}`}
                      className={`mx-0.5 min-w-0 overflow-hidden ${dragging && drag?.moved ? 'opacity-40' : ''}`}
                      style={{
                        gridColumn: `${bar.colStart + 1} / span 1`,
                        gridRow: bar.lane + 1
                      }}
                    >
                      <EventChip
                        campaign={campaign}
                        selected={selectedId === campaign.id}
                        compact
                        dragging={dragging}
                        onSelect={() => onSelect(campaign.id)}
                        onOpenPage={() => onOpenPage(campaign.id)}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return
                          event.preventDefault()
                          event.stopPropagation()
                          const goLiveAt = campaign.go_live_at || goLiveAtFromSlot(week[bar.colStart]!, 9)
                          setDrag({
                            id: campaign.id,
                            pointerId: event.pointerId,
                            originX: event.clientX,
                            originY: event.clientY,
                            clientX: event.clientX,
                            clientY: event.clientY,
                            goLiveAt,
                            liveGoLiveAt: goLiveAt,
                            moved: false
                          })
                          onSelect(campaign.id)
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {drag && dragged && drag.moved ? (
        <DragGhost
          campaign={dragged}
          goLiveAt={drag.liveGoLiveAt}
          x={drag.clientX}
          y={drag.clientY}
          compact
        />
      ) : null}
      {drag ? (
        <DragLayer
          drag={drag}
          onMove={(event, current) => {
            const moved =
              current.moved ||
              Math.abs(event.clientX - current.originX) > 4 ||
              Math.abs(event.clientY - current.originY) > 4
            setDrag({
              ...current,
              moved,
              clientX: event.clientX,
              clientY: event.clientY,
              liveGoLiveAt: liveDayFromPoint(event.clientX, event.clientY, current.goLiveAt)
            })
          }}
          onUp={(current) => {
            setDrag(null)
            if (current.moved && current.liveGoLiveAt !== current.goLiveAt) {
              onMoveCampaign(current.id, current.liveGoLiveAt)
              onCursorChange(startOfDay(new Date(current.liveGoLiveAt)))
            }
          }}
        />
      ) : null}
    </div>
  )
}

function TimedDayColumn({
  day,
  campaigns,
  selectedId,
  isToday,
  draftGoLiveAt,
  drag,
  occupiedIsos,
  onSelect,
  onOpenPage,
  onCreateSlot,
  onEventPointerDown,
  onDropInventory,
  suppressClick
}: {
  day: Date
  campaigns: CompassCampaign[]
  selectedId: string | null
  isToday: boolean
  draftGoLiveAt?: string | null
  drag: CalendarDrag | null
  occupiedIsos: Array<string | null | undefined>
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
  onCreateSlot: (day: Date, hour: number) => void
  onEventPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, campaign: CompassCampaign) => void
  onDropInventory?: (goLiveAt: string, card: InventoryCard) => void
  suppressClick: { current: boolean }
}) {
  const timedEvents = layoutTimedEvents(campaigns.flatMap((campaign) => {
    const minutes = minutesFromMidnight(campaign.go_live_at)
    return minutes == null ? [] : [{ id: campaign.id, minutes }]
  }))
  const eventLanes = new Map(timedEvents.map((event) => [event.id, event]))
  return (
    <div
      className={`relative min-w-0 overflow-hidden border-r border-neutral-100 last:border-r-0 ${
        isToday ? 'bg-[#e85d2a]/[0.04]' : ''
      }`}
    >
      {Array.from({ length: CALENDAR_HOURS }, (_, hour) => (
        <button
          key={hour}
          type="button"
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false
              return
            }
            onCreateSlot(day, hour)
          }}
          {...inventoryDropHandlers(nextOpenGoLiveAt(day, hour, occupiedIsos), onDropInventory)}
          className="group/slot absolute left-0 right-0 border-t border-neutral-100 hover:bg-[var(--compass-accent)]/[0.05]"
          style={{ top: hour * CALENDAR_HOUR_HEIGHT, height: CALENDAR_HOUR_HEIGHT }}
          aria-label={`Add campaign ${day.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })} ${hourLabel(hour)}`}
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-400 opacity-0 shadow-sm ring-1 ring-stone-200/80 group-hover/slot:opacity-100">
            + Add
          </span>
        </button>
      ))}
      {campaigns.map((campaign) => {
        const minutes = minutesFromMidnight(campaign.go_live_at)
        if (minutes == null) return null
        const dragging = drag?.id === campaign.id
        const placement = eventLanes.get(campaign.id)
        const laneCount = placement?.laneCount ?? 1
        const lane = placement?.lane ?? 0
        return (
          <div
            key={campaign.id}
            className={`absolute z-10 px-1 ${dragging ? 'z-20' : ''} ${dragging && drag?.moved ? 'opacity-40' : ''}`}
            style={{
              top: eventOffsetPx(minutes) + (CALENDAR_HOUR_HEIGHT - CALENDAR_EVENT_HEIGHT) / 2,
              height: CALENDAR_EVENT_HEIGHT,
              left: `calc(${(lane / laneCount) * 100}% + 2px)`,
              width: `calc(${100 / laneCount}% - 4px)`
            }}
          >
            <EventChip
              campaign={campaign}
              selected={selectedId === campaign.id}
              dragging={dragging}
              onSelect={() => {
                if (drag?.moved) return
                onSelect(campaign.id)
              }}
              onOpenPage={() => onOpenPage(campaign.id)}
              onPointerDown={(event) => onEventPointerDown(event, campaign)}
            />
          </div>
        )
      })}
      {drag?.moved && toDateOnly(new Date(drag.liveGoLiveAt)) === toDateOnly(day) ? (
        <div
          className="pointer-events-none absolute left-1 right-1 z-20 overflow-hidden rounded-xl border border-dashed border-[var(--compass-accent)]/50 bg-[var(--compass-accent)]/[0.08]"
          style={{
            top:
              eventOffsetPx(minutesFromMidnight(drag.liveGoLiveAt) ?? 0) +
              (CALENDAR_HOUR_HEIGHT - CALENDAR_EVENT_HEIGHT) / 2,
            height: CALENDAR_EVENT_HEIGHT
          }}
        />
      ) : null}
      {draftGoLiveAt && toDateOnly(new Date(draftGoLiveAt)) === toDateOnly(day) ? (
        <div
          className="pointer-events-none absolute left-1 right-1 overflow-hidden rounded-xl border border-dashed border-[var(--compass-accent)]/50 bg-[var(--compass-accent)]/[0.06] px-2.5 py-1.5"
          style={{
            top:
              eventOffsetPx(minutesFromMidnight(draftGoLiveAt) ?? 0) +
              (CALENDAR_HOUR_HEIGHT - CALENDAR_EVENT_HEIGHT) / 2,
            height: CALENDAR_EVENT_HEIGHT
          }}
        >
          <p className="text-[11px] font-medium text-[var(--compass-accent)]">New campaign</p>
          <p className="text-[11px] text-neutral-500">{formatGoLiveTime(draftGoLiveAt)}</p>
        </div>
      ) : null}
    </div>
  )
}

function HourGutter() {
  return (
    <div className="shrink-0" style={{ width: CALENDAR_GUTTER_PX }}>
      {Array.from({ length: CALENDAR_HOURS }, (_, hour) => (
        <div key={hour} className="relative" style={{ height: CALENDAR_HOUR_HEIGHT }}>
          {hour === 0 ? null : (
            <span className="absolute -top-2 right-2 text-[11px] tabular-nums text-neutral-400">
              {hourLabel(hour)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function DragLayer({
  drag,
  onMove,
  onUp
}: {
  drag: CalendarDrag
  onMove: (event: PointerEvent, drag: CalendarDrag) => void
  onUp: (drag: CalendarDrag) => void
}) {
  const dragRef = useRef(drag)
  const onMoveRef = useRef(onMove)
  const onUpRef = useRef(onUp)
  dragRef.current = drag
  onMoveRef.current = onMove
  onUpRef.current = onUp

  useEffect(() => {
    function move(event: PointerEvent) {
      if (event.pointerId !== dragRef.current.pointerId) return
      onMoveRef.current(event, dragRef.current)
    }
    function up(event: PointerEvent) {
      if (event.pointerId !== dragRef.current.pointerId) return
      onUpRef.current(dragRef.current)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  return null
}

function TimedBoard({
  days,
  byId,
  todayKey,
  selectedId,
  draftGoLiveAt,
  occupiedIsos,
  header,
  onSelect,
  onOpenPage,
  onCreateSlot,
  onMoveCampaign,
  onCursorChange,
  onDropInventory
}: {
  days: Date[]
  byId: Map<string, CompassCampaign>
  todayKey: string
  selectedId: string | null
  draftGoLiveAt?: string | null
  occupiedIsos: Array<string | null | undefined>
  header?: ReactNode
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
  onCreateSlot: (day: Date, hour: number) => void
  onMoveCampaign: (id: string, goLiveAt: string) => void
  onCursorChange: (day: Date) => void
  onDropInventory?: (goLiveAt: string, card: InventoryCard) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<CalendarDrag | null>(null)
  const suppressClick = useRef(false)
  const dragged = drag ? byId.get(drag.id) : null

  useEffect(() => {
    if (drag) return
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = CALENDAR_SCROLL_HOUR * CALENDAR_HOUR_HEIGHT
  }, [days, drag])

  function liveSlotFromPoint(clientX: number, clientY: number, ignoreIso: string) {
    const grid = gridRef.current
    const first = days[0]
    if (!grid || !first) return ignoreIso
    return slotFromGridPoint(
      first,
      days.length,
      grid.getBoundingClientRect(),
      clientX,
      clientY,
      occupiedIsos,
      ignoreIso
    )
  }

  useEffect(() => {
    if (!drag?.moved) return
    const handle = window.setInterval(() => {
      const grid = gridRef.current
      const first = days[0]
      if (!grid || !first) return
      const rect = grid.getBoundingClientRect()
      const step = days.length === 1 ? 1 : 7
      if (drag.clientX < rect.left - 12) onCursorChange(addDays(first, -step))
      else if (drag.clientX > rect.right + 12) onCursorChange(addDays(first, step))
    }, 450)
    return () => window.clearInterval(handle)
  }, [drag?.moved, drag?.clientX, days, onCursorChange])

  const boardMinWidth = CALENDAR_GUTTER_PX + days.length * CALENDAR_DAY_COL_MIN_PX

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      {header ? (
        <div className="sticky top-0 z-30" style={{ minWidth: boardMinWidth }}>
          {header}
        </div>
      ) : null}
      <div
        className="flex"
        style={{ height: CALENDAR_HOURS * CALENDAR_HOUR_HEIGHT, minWidth: boardMinWidth }}
      >
        <HourGutter />
        <div
          ref={gridRef}
          className="grid min-w-0 flex-1"
          style={{
            gridTemplateColumns: `repeat(${days.length}, minmax(${CALENDAR_DAY_COL_MIN_PX}px, 1fr))`
          }}
        >
          {days.map((day) => {
            const key = toDateOnly(day)
            const campaigns = Array.from(byId.values()).filter((campaign) => {
              const minutes = minutesFromMidnight(campaign.go_live_at)
              if (minutes == null || !campaign.go_live_at) return false
              return toDateOnly(new Date(campaign.go_live_at)) === key
            })
            return (
              <TimedDayColumn
                key={key}
                day={day}
                campaigns={campaigns}
                selectedId={selectedId}
                isToday={key === todayKey}
                draftGoLiveAt={draftGoLiveAt}
                drag={drag}
                occupiedIsos={occupiedIsos}
                onSelect={onSelect}
                onOpenPage={onOpenPage}
                onCreateSlot={onCreateSlot}
                onDropInventory={onDropInventory}
                suppressClick={suppressClick}
                onEventPointerDown={(event, campaign) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  event.stopPropagation()
                  const goLiveAt = campaign.go_live_at || goLiveAtFromSlot(day, 9)
                  setDrag({
                    id: campaign.id,
                    pointerId: event.pointerId,
                    originX: event.clientX,
                    originY: event.clientY,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    goLiveAt,
                    liveGoLiveAt: goLiveAt,
                    moved: false
                  })
                  onSelect(campaign.id)
                }}
              />
            )
          })}
        </div>
      </div>
      {drag && dragged && drag.moved ? (
        <DragGhost
          campaign={dragged}
          goLiveAt={drag.liveGoLiveAt}
          x={drag.clientX}
          y={drag.clientY}
        />
      ) : null}
      {drag ? (
        <DragLayer
          drag={drag}
          onMove={(event, current) => {
            const moved =
              current.moved ||
              Math.abs(event.clientX - current.originX) > 4 ||
              Math.abs(event.clientY - current.originY) > 4
            setDrag({
              ...current,
              moved,
              clientX: event.clientX,
              clientY: event.clientY,
              liveGoLiveAt: liveSlotFromPoint(event.clientX, event.clientY, current.goLiveAt)
            })
          }}
          onUp={(current) => {
            if (current.moved) suppressClick.current = true
            setDrag(null)
            if (current.moved && current.liveGoLiveAt !== current.goLiveAt) {
              onMoveCampaign(current.id, current.liveGoLiveAt)
              onCursorChange(startOfDay(new Date(current.liveGoLiveAt)))
            }
          }}
        />
      ) : null}
    </div>
  )
}

function WeekGrid({
  cursor,
  byId,
  todayKey,
  selectedId,
  draftGoLiveAt,
  occupiedIsos,
  onSelect,
  onOpenPage,
  onCreateSlot,
  onMoveCampaign,
  onCursorChange,
  onDropInventory
}: {
  cursor: Date
  byId: Map<string, CompassCampaign>
  todayKey: string
  selectedId: string | null
  draftGoLiveAt?: string | null
  occupiedIsos: Array<string | null | undefined>
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
  onCreateSlot: (day: Date, hour: number) => void
  onMoveCampaign: (id: string, goLiveAt: string) => void
  onCursorChange: (day: Date) => void
  onDropInventory?: (goLiveAt: string, card: InventoryCard) => void
}) {
  const days = weekDays(cursor)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <TimedBoard
        days={days}
        byId={byId}
        todayKey={todayKey}
        selectedId={selectedId}
        draftGoLiveAt={draftGoLiveAt}
        occupiedIsos={occupiedIsos}
        onSelect={onSelect}
        onOpenPage={onOpenPage}
        onCreateSlot={onCreateSlot}
        onMoveCampaign={onMoveCampaign}
        onCursorChange={onCursorChange}
        onDropInventory={onDropInventory}
        header={
          <div className="flex border-b border-neutral-200 bg-stone-50">
            <div className="shrink-0" style={{ width: CALENDAR_GUTTER_PX }} />
            <div
              className="grid min-w-0 flex-1"
              style={{
                gridTemplateColumns: `repeat(7, minmax(${CALENDAR_DAY_COL_MIN_PX}px, 1fr))`
              }}
            >
              {days.map((day) => {
                const key = toDateOnly(day)
                const isToday = key === todayKey
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => onCreateSlot(day, 9)}
                    {...inventoryDropHandlers(nextOpenGoLiveAt(day, 9, occupiedIsos), onDropInventory)}
                    className={`border-r border-neutral-100 px-3 py-2 text-left last:border-r-0 hover:bg-[var(--compass-accent)]/[0.04] ${
                      isToday ? 'bg-[#e85d2a]/[0.06]' : 'bg-stone-50'
                    }`}
                  >
                    <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                      {WEEKDAY_LABELS[(day.getDay() + 6) % 7]}
                    </div>
                    <div
                      className={`text-[15px] tabular-nums ${
                        isToday ? 'font-semibold text-[#e85d2a]' : 'text-neutral-800'
                      }`}
                    >
                      {day.getDate()}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        }
      />
    </div>
  )
}

function DayList({
  cursor,
  campaigns,
  selectedId,
  draftGoLiveAt,
  occupiedIsos,
  onSelect,
  onOpenPage,
  onCreateSlot,
  onMoveCampaign,
  onCursorChange,
  onDropInventory
}: {
  cursor: Date
  campaigns: CompassCampaign[]
  selectedId: string | null
  draftGoLiveAt?: string | null
  occupiedIsos: Array<string | null | undefined>
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
  onCreateSlot: (day: Date, hour: number) => void
  onMoveCampaign: (id: string, goLiveAt: string) => void
  onCursorChange: (day: Date) => void
  onDropInventory?: (goLiveAt: string, card: InventoryCard) => void
}) {
  const todayKey = toDateOnly(new Date())
  const day = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex shrink-0 border-b border-neutral-200 bg-stone-50 px-3 py-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          {day.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
        </div>
      </div>
      <TimedBoard
        days={[day]}
        byId={byId}
        todayKey={todayKey}
        selectedId={selectedId}
        draftGoLiveAt={draftGoLiveAt}
        occupiedIsos={occupiedIsos}
        onSelect={onSelect}
        onOpenPage={onOpenPage}
        onCreateSlot={onCreateSlot}
        onMoveCampaign={onMoveCampaign}
        onCursorChange={onCursorChange}
        onDropInventory={onDropInventory}
      />
    </div>
  )
}
