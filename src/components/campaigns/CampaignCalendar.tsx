'use client'

import { useMemo } from 'react'
import {
  WEEKDAY_LABELS,
  campaignOverlapsPeriod,
  datedCampaigns,
  formatPeriodLabel,
  layoutWeekBars,
  monthWeeks,
  periodRange,
  toDateOnly,
  weekDays,
  type CalendarGrain
} from '@/lib/campaign-calendar'
import { startOfDay } from '@/lib/campaign-timeline'
import {
  campaignStatusLabel,
  formatCampaignDate,
  type CompassCampaign
} from '@/lib/campaigns'

type Props = {
  campaigns: CompassCampaign[]
  grain: CalendarGrain
  cursor: Date
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
}

export function CampaignCalendar({
  campaigns,
  grain,
  cursor,
  selectedId,
  onSelect,
  onOpenPage
}: Props) {
  const items = useMemo(
    () =>
      datedCampaigns(
        campaigns.map((c) => ({ id: c.id, start: c.start_date, end: c.end_date }))
      ),
    [campaigns]
  )
  const byId = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns])
  const { start, end } = periodRange(cursor, grain)
  const inPeriod = campaigns.filter((c) =>
    campaignOverlapsPeriod(c.start_date, c.end_date, start, end)
  )
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
        />
      ) : null}

      {grain === 'week' ? (
        <WeekGrid
          cursor={cursor}
          items={items}
          byId={byId}
          todayKey={todayKey}
          selectedId={selectedId}
          onSelect={onSelect}
          onOpenPage={onOpenPage}
        />
      ) : null}

      {grain === 'day' ? (
        <DayList
          campaigns={inPeriod}
          selectedId={selectedId}
          onSelect={onSelect}
          onOpenPage={onOpenPage}
        />
      ) : null}
    </div>
  )
}

function MonthGrid({
  cursor,
  items,
  byId,
  todayKey,
  selectedId,
  onSelect,
  onOpenPage
}: {
  cursor: Date
  items: ReturnType<typeof datedCampaigns>
  byId: Map<string, CompassCampaign>
  todayKey: string
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
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
                  <div
                    key={key}
                    className={`border-r border-neutral-100 last:border-r-0 ${
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
                  </div>
                )
              })}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-1 top-7 grid grid-cols-7 px-0.5"
                style={{ gridTemplateRows: `repeat(${Math.max(laneCount, 1)}, 22px)` }}
              >
                {bars.map((bar) => {
                  const campaign = byId.get(bar.campaignId)
                  if (!campaign) return null
                  const isSelected = selectedId === campaign.id
                  return (
                    <button
                      key={`${campaign.id}-${bar.colStart}-${wi}`}
                      type="button"
                      className={`pointer-events-auto mx-0.5 truncate rounded-md border px-1.5 text-left text-[11px] font-medium ${
                        isSelected
                          ? 'border-[#5e6ad2] bg-white text-neutral-800 shadow-[0_0_0_1px_rgba(94,106,210,0.28)]'
                          : 'border-neutral-200 bg-white text-neutral-700 shadow-sm hover:border-neutral-300'
                      }`}
                      style={{
                        gridColumn: `${bar.colStart + 1} / span ${bar.colSpan}`,
                        gridRow: bar.lane + 1
                      }}
                      title={`${campaign.name} · ${formatCampaignDate(campaign.start_date)} → ${formatCampaignDate(campaign.end_date)}`}
                      onClick={() => onSelect(campaign.id)}
                      onDoubleClick={() => onOpenPage(campaign.id)}
                    >
                      <span
                        className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                        style={{ background: campaign.color || '#94a3b8' }}
                      />
                      {campaign.name}
                    </button>
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

function WeekGrid({
  cursor,
  items,
  byId,
  todayKey,
  selectedId,
  onSelect,
  onOpenPage
}: {
  cursor: Date
  items: ReturnType<typeof datedCampaigns>
  byId: Map<string, CompassCampaign>
  todayKey: string
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
}) {
  const days = weekDays(cursor)
  const bars = layoutWeekBars(days, items)
  const laneCount = bars.reduce((max, bar) => Math.max(max, bar.lane + 1), 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="grid grid-cols-7 border-b border-neutral-200">
        {days.map((day) => {
          const key = toDateOnly(day)
          const isToday = key === todayKey
          return (
            <div
              key={key}
              className={`border-r border-neutral-100 px-3 py-2 last:border-r-0 ${
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
            </div>
          )
        })}
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 grid grid-cols-7">
          {days.map((day) => (
            <div
              key={toDateOnly(day)}
              className={`border-r border-neutral-100 last:border-r-0 ${
                toDateOnly(day) === todayKey ? 'bg-[#5e6ad2]/[0.04]' : ''
              }`}
            />
          ))}
        </div>
        <div
          className="absolute inset-x-1 top-3 grid gap-y-1"
          style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
        >
          {bars.map((bar) => {
            const campaign = byId.get(bar.campaignId)
            if (!campaign) return null
            const isSelected = selectedId === campaign.id
            return (
              <button
                key={campaign.id}
                type="button"
                className={`h-10 truncate rounded-md border px-2 text-left text-[12px] font-medium ${
                  isSelected
                    ? 'border-[#5e6ad2] bg-white text-neutral-800 shadow-[0_0_0_1px_rgba(94,106,210,0.28)]'
                    : 'border-neutral-200 bg-white text-neutral-700 shadow-sm hover:border-neutral-300'
                }`}
                style={{
                  gridColumn: `${bar.colStart + 1} / span ${bar.colSpan}`,
                  gridRow: bar.lane + 1
                }}
                title={`${campaign.name} · ${formatCampaignDate(campaign.start_date)} → ${formatCampaignDate(campaign.end_date)}`}
                onClick={() => onSelect(campaign.id)}
                onDoubleClick={() => onOpenPage(campaign.id)}
              >
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: campaign.color || '#94a3b8' }}
                />
                {campaign.name}
              </button>
            )
          })}
        </div>
        {laneCount === 0 ? (
          <p className="relative px-4 py-10 text-center text-sm text-neutral-400">
            No dated campaigns this week
          </p>
        ) : null}
      </div>
    </div>
  )
}

function DayList({
  campaigns,
  selectedId,
  onSelect,
  onOpenPage
}: {
  campaigns: CompassCampaign[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenPage: (id: string) => void
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-neutral-200 bg-white">
      {campaigns.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-neutral-400">
          No campaigns on this day
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <button
                type="button"
                onClick={() => onSelect(campaign.id)}
                onDoubleClick={() => onOpenPage(campaign.id)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50 ${
                  selectedId === campaign.id ? 'bg-neutral-50' : ''
                }`}
              >
                <span
                  className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ background: campaign.color || '#94a3b8' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-neutral-900">
                    {campaign.name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-neutral-500">
                    {formatCampaignDate(campaign.start_date)} →{' '}
                    {formatCampaignDate(campaign.end_date)}
                    <span className="mx-1.5 text-neutral-300">·</span>
                    {campaignStatusLabel(campaign.status)}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
