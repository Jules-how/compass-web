'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmailVolumeChart } from '@/components/sales/EmailVolumeChart'
import { TargetingSuccessMap } from '@/components/sales/TargetingSuccessMap'
import { SALES_OVERVIEW_DEMO, type SalesCampaignRef, type SalesDeal } from '@/lib/sales-demo-data'
import { cn } from '@/lib/utils'

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

function statusBadge(status: SalesCampaignRef['status']) {
  switch (status) {
    case 'live':
      return (
        <Badge variant="success" appearance="light" size="sm">
          Live
        </Badge>
      )
    case 'launching':
      return (
        <Badge variant="primary" appearance="light" size="sm">
          Launching
        </Badge>
      )
    case 'paused':
      return (
        <Badge variant="warning" appearance="light" size="sm">
          Paused
        </Badge>
      )
    case 'completed':
      return (
        <Badge variant="secondary" appearance="light" size="sm">
          Completed
        </Badge>
      )
  }
}

function stageLabel(stage: SalesDeal['stage']) {
  switch (stage) {
    case 'qualified':
      return 'Qualified'
    case 'meeting':
      return 'Meeting'
    case 'proposal':
      return 'Proposal'
    case 'won':
      return 'Won'
  }
}

function Kpi({
  label,
  value,
  hint,
  delta,
  href
}: {
  label: string
  value: string
  hint?: string
  delta?: number
  href?: string
}) {
  const inner = (
    <>
      <div className="compass-section-label">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900 tabular-nums">
        {value}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        {typeof delta === 'number' ? (
          <span className={cn(delta >= 0 ? 'text-emerald-700' : 'text-red-600')}>
            {delta >= 0 ? '+' : ''}
            {delta}%
          </span>
        ) : null}
        {hint ? <span>{hint}</span> : null}
      </div>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="compass-panel block p-4 transition hover:-translate-y-0.5 hover:shadow-lift"
      >
        {inner}
      </Link>
    )
  }

  return <div className="compass-panel p-4">{inner}</div>
}

export function SalesOverview() {
  const model = SALES_OVERVIEW_DEMO
  const live = model.campaigns.filter((c) => c.status === 'live')
  const launching = model.campaigns.filter((c) => c.status === 'launching')
  const dealFlowValue = model.deals.reduce((sum, deal) => sum + deal.value, 0)

  return (
    <div className="space-y-7">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Emails sent"
          value={model.kpis.emailsSent.toLocaleString()}
          delta={model.kpis.emailsSentDelta}
          hint="Last 30 days"
        />
        <Kpi
          label="Live offers"
          value={String(model.kpis.liveOffers)}
          hint={`${live.length} campaigns live`}
        />
        <Kpi
          label="Replies"
          value={model.kpis.replies.toLocaleString()}
          hint={`${model.kpis.replyRate}% reply rate`}
        />
        <Kpi
          label="Expected revenue"
          value={formatMoney(model.kpis.expectedRevenue)}
          delta={model.kpis.expectedRevenueDelta}
          hint="Open pipeline"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Meetings booked" value={String(model.kpis.meetingsBooked)} hint="Attributed" />
        <Kpi
          label="Positive reply rate"
          value={`${model.kpis.positiveReplyRate}%`}
          hint="Interested + meeting"
        />
        <Kpi label="Bounce rate" value={`${model.kpis.bounceRate}%`} hint="Across live sends" />
        <Kpi
          label="Deal flow"
          value={formatMoney(dealFlowValue)}
          hint={`${model.deals.length} active deals`}
          href="/sales/pipeline"
        />
      </div>

      <EmailVolumeChart model={model} />

      <TargetingSuccessMap />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Campaign progress</CardTitle>
              <CardDescription>What is live, launching, and how far through the sequence</CardDescription>
            </div>
            <Link
              href="/sales/pipeline"
              className="text-sm font-medium text-[#c2410c] hover:underline"
            >
              Open planner
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...launching, ...live, ...model.campaigns.filter((c) => c.status === 'paused')].map(
              (campaign) => (
                <div
                  key={campaign.id}
                  className="rounded-xl border border-stone-200/70 bg-stone-50/50 p-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-neutral-900">{campaign.name}</div>
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {campaign.offer} · {campaign.list}
                      </div>
                    </div>
                    {statusBadge(campaign.status)}
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-200/80">
                    <div
                      className="h-full rounded-full bg-[#e85d2a]"
                      style={{ width: `${campaign.progress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-500">
                    <span>
                      <span className="font-medium text-neutral-800">
                        {campaign.sent.toLocaleString()}
                      </span>{' '}
                      sent
                    </span>
                    <span>
                      <span className="font-medium text-neutral-800">{campaign.replies}</span> replies
                    </span>
                    <span>
                      <span className="font-medium text-neutral-800">{campaign.meetings}</span>{' '}
                      meetings
                    </span>
                    <span>
                      <span className="font-medium text-neutral-800">
                        {formatMoney(campaign.expectedRevenue)}
                      </span>{' '}
                      expected
                    </span>
                  </div>
                </div>
              )
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Deal flow</CardTitle>
              <CardDescription>Opportunities moving out of Instantly replies</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {model.deals.map((deal) => (
              <div
                key={deal.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-200/70 px-3.5 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-neutral-900">{deal.company}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {deal.name} · {deal.offer}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums text-neutral-900">
                    {formatMoney(deal.value)}
                  </div>
                  <div className="text-[11px] text-neutral-500">{stageLabel(deal.stage)}</div>
                </div>
              </div>
            ))}
            <div className="rounded-xl bg-stone-50 px-3.5 py-3 text-sm text-neutral-600">
              Also worth watching next: best-performing offer, sequence step drop-off, and contacts
              remaining in each list ({model.kpis.contactsRemaining.toLocaleString()} left across
              live campaigns).
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
