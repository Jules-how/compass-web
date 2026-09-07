'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { TrendingUp } from 'lucide-react'
import { CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart'
import {
  filterSalesSeries,
  type SalesDateRange,
  type SalesOverviewModel
} from '@/lib/sales-demo-data'
import { cn } from '@/lib/utils'

const chartConfig = {
  sent: {
    label: 'Emails sent',
    color: '#e85d2a'
  }
} satisfies ChartConfig

type TooltipProps = {
  active?: boolean
  payload?: Array<{
    payload: {
      date: string
      sent: number
      replies: number
      opens: number
    }
  }>
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border border-stone-200/80 bg-white p-3 shadow-lg">
      <div className="mb-1 text-sm text-neutral-500">{data.date}</div>
      <div className="text-base font-bold tabular-nums text-neutral-900">
        {data.sent.toLocaleString()} sent
      </div>
      <div className="mt-1 flex gap-3 text-[11px] text-neutral-500">
        <span>{data.opens.toLocaleString()} opens</span>
        <span>{data.replies.toLocaleString()} replies</span>
      </div>
    </div>
  )
}

function FilterChip({
  active,
  children,
  onClick
}: {
  active?: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1 text-xs font-medium transition',
        active
          ? 'bg-white text-[#c2410c] shadow-soft ring-1 ring-stone-200/80'
          : 'bg-stone-100 text-neutral-600 hover:bg-stone-200/80 hover:text-neutral-900'
      )}
    >
      {children}
    </button>
  )
}

function MultiFilter({
  label,
  options,
  selected,
  onChange
}: {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={selected.length === 0} onClick={() => onChange([])}>
          All
        </FilterChip>
        {options.map((option) => {
          const active = selected.includes(option.id)
          return (
            <FilterChip
              key={option.id}
              active={active}
              onClick={() =>
                onChange(
                  active ? selected.filter((id) => id !== option.id) : [...selected, option.id]
                )
              }
            >
              {option.label}
            </FilterChip>
          )
        })}
      </div>
    </div>
  )
}

export function EmailVolumeChart({ model }: { model: SalesOverviewModel }) {
  const [range, setRange] = useState<SalesDateRange>('30d')
  const [campaigns, setCampaigns] = useState<string[]>([])
  const [offers, setOffers] = useState<string[]>([])
  const [lists, setLists] = useState<string[]>([])

  const filtered = useMemo(
    () => filterSalesSeries(model, { range, campaigns, offers, lists }),
    [model, range, campaigns, offers, lists]
  )

  const peak = filtered.series.reduce(
    (best, point) => (point.sent > best.sent ? point : best),
    filtered.series[0] ?? { date: '', sent: 0, opens: 0, replies: 0 }
  )
  const change =
    filtered.series.length > 1
      ? ((filtered.series[filtered.series.length - 1].sent - filtered.series[0].sent) /
          Math.max(1, filtered.series[0].sent)) *
        100
      : 0

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div>
          <h2 className="mb-1 text-base font-medium text-neutral-500">Email volume</h2>
          <div className="flex flex-wrap items-baseline gap-2 sm:gap-3.5">
            <span className="text-4xl font-bold tabular-nums tracking-tight text-neutral-900">
              {filtered.emailsSent.toLocaleString()}
            </span>
            <div
              className={cn(
                'flex items-center gap-1',
                model.kpis.emailsSentDelta >= 0 ? 'text-emerald-600' : 'text-red-600'
              )}
            >
              <TrendingUp className="h-4 w-4" />
              <span className="font-medium">
                {model.kpis.emailsSentDelta >= 0 ? '+' : ''}
                {model.kpis.emailsSentDelta}%
              </span>
              <span className="font-normal text-neutral-500">vs prior period</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-stone-200/70 bg-stone-50/70 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
              Range
            </span>
            {(
              [
                ['7d', '7 days'],
                ['30d', '30 days'],
                ['90d', '90 days'],
                ['ytd', 'YTD']
              ] as const
            ).map(([id, label]) => (
              <FilterChip key={id} active={range === id} onClick={() => setRange(id)}>
                {label}
              </FilterChip>
            ))}
          </div>
          <MultiFilter
            label="Campaigns"
            options={model.campaigns.map((c) => ({ id: c.id, label: c.name }))}
            selected={campaigns}
            onChange={setCampaigns}
          />
          {model.offers.length > 0 ? (
            <MultiFilter
              label="Offers"
              options={model.offers.map((offer) => ({ id: offer, label: offer }))}
              selected={offers}
              onChange={setOffers}
            />
          ) : null}
          {model.lists.length > 0 ? (
            <MultiFilter
              label="Lists"
              options={model.lists.map((list) => ({ id: list, label: list }))}
              selected={lists}
              onChange={setLists}
            />
          ) : null}
        </div>

        <div>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">Replies in view:</span>
              <span className="font-semibold tabular-nums">{filtered.replies.toLocaleString()}</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-neutral-500">
              <span>
                High:{' '}
                <span className="font-medium text-sky-700">{filtered.high.toLocaleString()}</span>
              </span>
              <span>
                Low:{' '}
                <span className="font-medium text-amber-700">{filtered.low.toLocaleString()}</span>
              </span>
              <span>
                Change:{' '}
                <span className={cn('font-medium', change >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                  {change >= 0 ? '+' : ''}
                  {change.toFixed(1)}%
                </span>
              </span>
            </div>
          </div>

          <ChartContainer
            config={chartConfig}
            className="h-80 w-full aspect-auto [&_.recharts-curve.recharts-tooltip-cursor]:stroke-neutral-300"
          >
            <ComposedChart data={filtered.series} margin={{ top: 20, right: 10, left: 5, bottom: 20 }}>
              <defs>
                <filter id="lineShadow" x="-100%" y="-100%" width="300%" height="300%">
                  <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="rgba(232, 93, 42, 0.35)" />
                </filter>
                <filter id="dotShadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.25)" />
                </filter>
                <pattern id="dotGrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="1" fill="#d6d3d1" fillOpacity="0.45" />
                </pattern>
              </defs>

              <rect x="0" y="0" width="100%" height="100%" fill="url(#dotGrid)" style={{ pointerEvents: 'none' }} />

              <CartesianGrid
                strokeDasharray="4 8"
                stroke="#e7e5e4"
                strokeOpacity={1}
                horizontal
                vertical={false}
              />

              {peak?.date ? (
                <ReferenceLine x={peak.date} stroke="#e85d2a" strokeDasharray="4 4" strokeWidth={1} />
              ) : null}

              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#78716c' }}
                tickMargin={15}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#78716c' }}
                tickFormatter={(value) => Number(value).toLocaleString()}
                tickMargin={12}
                width={48}
              />
              <ChartTooltip
                content={<CustomTooltip />}
                cursor={{ strokeDasharray: '3 3', stroke: '#a8a29e', strokeOpacity: 0.6 }}
              />
              <Line
                type="monotone"
                dataKey="sent"
                stroke="var(--color-sent)"
                strokeWidth={2}
                filter="url(#lineShadow)"
                dot={(props) => {
                  const { cx, cy, payload } = props
                  if (payload.date === peak.date) {
                    return (
                      <circle
                        key={`dot-${payload.date}`}
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill="#e85d2a"
                        stroke="white"
                        strokeWidth={2}
                        filter="url(#dotShadow)"
                      />
                    )
                  }
                  return <g key={`dot-${payload.date}`} />
                }}
                activeDot={{
                  r: 6,
                  fill: '#e85d2a',
                  stroke: 'white',
                  strokeWidth: 2,
                  filter: 'url(#dotShadow)'
                }}
              />
            </ComposedChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  )
}
