'use client'

import { useEffect, useMemo, useRef } from 'react'
import {
  CALENDAR_EVENT_HEIGHT,
  CALENDAR_GUTTER_PX,
  CALENDAR_HOUR_HEIGHT,
  CALENDAR_HOURS,
  CALENDAR_SCROLL_HOUR,
  WEEKDAY_LABELS,
  datedGoLiveCampaigns,
  eventOffsetPx,
  formatPeriodLabel,
  goLiveAtFromSlot,
  goLiveFallsInPeriod,
  hourLabel,
  layoutTimedEvents,
  layoutWeekBars,
  minutesFromMidnight,
  monthWeeks,
  periodRange,
  toDateOnly,
  weekDays,
  type CalendarGrain
} from '@/lib/campaign-calendar'
import { startOfDay } from '@/lib/campaign-timeline'
import {
  formatGoLiveAt,
  formatGoLiveTime,
  type CompassCampaign
} from '@/lib/campaigns'

type Props = {
  campaigns: CompassCampaign[]
  grain: CalendarGrain
  cursor: Date
  selectedId: string | null
  draftGoLiveAt?: string | null
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
  onCreateSlot: (goLiveAt: string) => void
}

export function CampaignCalendar({
  campaigns,
  grain,
  cursor,
  selectedId,
  draftGoLiveAt,
  onSelect,
  onOpenPage,
  onCreateSlot
}: Props) {
  const items = useMemo(
    () => datedGoLiveCampaigns(campaigns.map((c) => ({ id: c.id, go_live_at: c.go_live_at }))),
    [campaigns]
  )
  const byId = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns])
  const { start, end } = periodRange(cursor, grain)
  const inPeriod = campaigns.filter((c) => goLiveFallsInPeriod(c.go_live_at, start, end))
  const today = startOfDay(new Date())
  const todayKey = toDateOnly(today)

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
          onSelect={onSelect}
          onOpenPage={onOpenPage}
          onCreateSlot={onCreateSlot}
        />
      ) : null}

      {grain === 'week' ? (
        <WeekGrid
          cursor={cursor}
          items={items}
          byId={byId}
          todayKey={todayKey}
          selectedId={selectedId}
          draftGoLiveAt={draftGoLiveAt}
          onSelect={onSelect}
          onOpenPage={onOpenPage}
          onCreateSlot={onCreateSlot}
        />
      ) : null}

      {grain === 'day' ? (
        <DayList
          cursor={cursor}
          campaigns={inPeriod}
          selectedId={selectedId}
          draftGoLiveAt={draftGoLiveAt}
          onSelect={onSelect}
          onOpenPage={onOpenPage}
          onCreateSlot={onCreateSlot}
        />
      ) : null}
    </div>
  )
}

function EventChip({
  campaign,
  selected,
  compact,
  onSelect,
  onOpenPage
}: {
  campaign: CompassCampaign
  selected: boolean
  compact?: boolean
  onSelect: () => void
  onOpenPage: () => void
}) {
  const time = formatGoLiveTime(campaign.go_live_at)
  return (
    <button
      type="button"
      className={`pointer-events-auto flex w-full min-w-0 flex-col justify-center overflow-hidden rounded-lg border text-left font-medium ${
        compact ? 'h-[22px] px-1.5 py-0 text-[11px]' : 'h-full px-2 py-1.5 text-[12px]'
      } ${
        selected
          ? 'border-[#5e6ad2] bg-white text-neutral-800 shadow-[0_0_0_1px_rgba(94,106,210,0.28)]'
          : 'border-neutral-200 bg-white text-neutral-700 shadow-sm hover:border-neutral-300'
      }`}
      title={`${campaign.name} · ${formatGoLiveAt(campaign.go_live_at)}`}
      onClick={onSelect}
      onDoubleClick={onOpenPage}
    >
      <span className="flex min-w-0 items-center gap-1">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: campaign.color || '#94a3b8' }}
        />
        {time ? (
          <span className="shrink-0 tabular-nums text-neutral-500">{time}</span>
        ) : null}
        {compact ? <span className="min-w-0 truncate">{campaign.name}</span> : null}
      </span>
      {compact ? null : (
        <span className="min-w-0 line-clamp-2 leading-snug">{campaign.name}</span>
      )}
    </button>
  )
}

function MonthGrid({
  cursor,
  items,
  byId,
  todayKey,
  selectedId,
  onSelect,
  onOpenPage,
  onCreateSlot
}: {
  cursor: Date
  items: ReturnType<typeof datedGoLiveCampaigns>
  byId: Map<string, CompassCampaign>
  todayKey: string
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
  onCreateSlot: (goLiveAt: string) => void
}) {
  const weeks = monthWeeks(cursor)
  const month = cursor.getMonth()

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-[#f7f8f9]">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-neutral-400"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-6">
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
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => onCreateSlot(goLiveAtFromSlot(day, 9))}
                    className={`group/slot w-full border-r border-neutral-100 text-left last:border-r-0 hover:bg-[var(--compass-accent)]/[0.04] ${
                      isToday ? 'bg-[#5e6ad2]/[0.06]' : ''
                    }`}
                  >
                    <div
                      className={`px-2 pt-1.5 text-[12px] tabular-nums ${
                        isToday
                          ? 'font-semibold text-[#5e6ad2]'
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
                  return (
                    <div
                      key={`${campaign.id}-${bar.colStart}-${wi}`}
                      className="mx-0.5 min-w-0 overflow-hidden"
                      style={{
                        gridColumn: `${bar.colStart + 1} / span 1`,
                        gridRow: bar.lane + 1
                      }}
                    >
                      <EventChip
                        campaign={campaign}
                        selected={selectedId === campaign.id}
                        compact
                        onSelect={() => onSelect(campaign.id)}
                        onOpenPage={() => onOpenPage(campaign.id)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TimedDayColumn({
  day,
  campaigns,
  selectedId,
  isToday,
  draftGoLiveAt,
  onSelect,
  onOpenPage,
  onCreateSlot
}: {
  day: Date
  campaigns: CompassCampaign[]
  selectedId: string | null
  isToday: boolean
  draftGoLiveAt?: string | null
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
  onCreateSlot: (goLiveAt: string) => void
}) {
  const lanes = layoutTimedEvents(
    campaigns.flatMap((campaign) => {
      const minutes = minutesFromMidnight(campaign.go_live_at)
      if (minutes == null) return []
      return [{ id: campaign.id, minutes }]
    })
  )
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]))

  return (
    <div
      className={`relative min-w-0 overflow-hidden border-r border-neutral-100 last:border-r-0 ${
        isToday ? 'bg-[#5e6ad2]/[0.04]' : ''
      }`}
    >
      {Array.from({ length: CALENDAR_HOURS }, (_, hour) => (
        <button
          key={hour}
          type="button"
          onClick={() => onCreateSlot(goLiveAtFromSlot(day, hour))}
          className="group/slot absolute left-0 right-0 border-t border-neutral-100 hover:bg-[var(--compass-accent)]/[0.05]"
          style={{ top: hour * CALENDAR_HOUR_HEIGHT, height: CALENDAR_HOUR_HEIGHT }}
          aria-label={`Add campaign ${day.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })} ${hourLabel(hour)}`}
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-400 opacity-0 shadow-sm ring-1 ring-stone-200/80 group-hover/slot:opacity-100">
            + Add
          </span>
        </button>
      ))}
      {lanes.map((lane) => {
        const campaign = byId.get(lane.id)
        if (!campaign) return null
        const widthPct = 100 / lane.laneCount
        return (
          <div
            key={campaign.id}
            className="absolute z-10 overflow-hidden px-0.5"
            style={{
              top: eventOffsetPx(lane.minutes),
              height: CALENDAR_EVENT_HEIGHT,
              left: `calc(${lane.lane * widthPct}% + 2px)`,
              width: `calc(${widthPct}% - 4px)`
            }}
          >
            <EventChip
              campaign={campaign}
              selected={selectedId === campaign.id}
              onSelect={() => onSelect(campaign.id)}
              onOpenPage={() => onOpenPage(campaign.id)}
            />
          </div>
        )
      })}
      {draftGoLiveAt && toDateOnly(new Date(draftGoLiveAt)) === toDateOnly(day) ? (
        <div
          className="pointer-events-none absolute left-1 right-1 overflow-hidden rounded-lg border border-dashed border-[var(--compass-accent)]/50 bg-[var(--compass-accent)]/[0.06] px-2 py-1.5"
          style={{
            top: eventOffsetPx(minutesFromMidnight(draftGoLiveAt) ?? 0),
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

function TimedBoard({
  days,
  byId,
  todayKey,
  selectedId,
  draftGoLiveAt,
  onSelect,
  onOpenPage,
  onCreateSlot
}: {
  days: Date[]
  byId: Map<string, CompassCampaign>
  todayKey: string
  selectedId: string | null
  draftGoLiveAt?: string | null
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
  onCreateSlot: (goLiveAt: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = CALENDAR_SCROLL_HOUR * CALENDAR_HOUR_HEIGHT
  }, [days])

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <div
        className="flex"
        style={{ height: CALENDAR_HOURS * CALENDAR_HOUR_HEIGHT }}
      >
        <HourGutter />
        <div
          className="grid min-w-0 flex-1"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
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
                onSelect={onSelect}
                onOpenPage={onOpenPage}
                onCreateSlot={onCreateSlot}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WeekGrid({
  cursor,
  items,
  byId,
  todayKey,
  selectedId,
  draftGoLiveAt,
  onSelect,
  onOpenPage,
  onCreateSlot
}: {
  cursor: Date
  items: ReturnType<typeof datedGoLiveCampaigns>
  byId: Map<string, CompassCampaign>
  todayKey: string
  selectedId: string | null
  draftGoLiveAt?: string | null
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
  onCreateSlot: (goLiveAt: string) => void
}) {
  const days = weekDays(cursor)
  const weekIds = new Set(items.map((item) => item.id))
  const weekById = new Map(
    [...byId.entries()].filter(([id]) => weekIds.has(id))
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex shrink-0 border-b border-neutral-200 bg-[#f7f8f9]">
        <div className="shrink-0" style={{ width: CALENDAR_GUTTER_PX }} />
        <div className="grid min-w-0 flex-1 grid-cols-7">
          {days.map((day) => {
            const key = toDateOnly(day)
            const isToday = key === todayKey
            return (
              <button
                type="button"
                key={key}
                onClick={() => onCreateSlot(goLiveAtFromSlot(day, 9))}
                className={`border-r border-neutral-100 px-3 py-2 text-left last:border-r-0 hover:bg-[var(--compass-accent)]/[0.04] ${
                  isToday ? 'bg-[#5e6ad2]/[0.06]' : 'bg-[#f7f8f9]'
                }`}
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  {WEEKDAY_LABELS[(day.getDay() + 6) % 7]}
                </div>
                <div
                  className={`text-[15px] tabular-nums ${
                    isToday ? 'font-semibold text-[#5e6ad2]' : 'text-neutral-800'
                  }`}
                >
                  {day.getDate()}
                </div>
              </button>
            )
          })}
        </div>
      </div>
      <TimedBoard
        days={days}
        byId={weekById}
        todayKey={todayKey}
        selectedId={selectedId}
        draftGoLiveAt={draftGoLiveAt}
        onSelect={onSelect}
        onOpenPage={onOpenPage}
        onCreateSlot={onCreateSlot}
      />
    </div>
  )
}

function DayList({
  cursor,
  campaigns,
  selectedId,
  draftGoLiveAt,
  onSelect,
  onOpenPage,
  onCreateSlot
}: {
  cursor: Date
  campaigns: CompassCampaign[]
  selectedId: string | null
  draftGoLiveAt?: string | null
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
  onCreateSlot: (goLiveAt: string) => void
}) {
  const todayKey = toDateOnly(new Date())
  const day = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex shrink-0 border-b border-neutral-200 bg-[#f7f8f9] px-3 py-2">
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
        onSelect={onSelect}
        onOpenPage={onOpenPage}
        onCreateSlot={onCreateSlot}
      />
    </div>
  )
}
