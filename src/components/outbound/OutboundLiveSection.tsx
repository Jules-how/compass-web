'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  listActiveOutboundCampaigns,
  type OutboundLiveCampaign
} from '@/lib/outbound-live-demo'
import { cn } from '@/lib/utils'

const VISIBLE = 3
const DROPDOWN_WINDOW = 6

function statusBadge(status: OutboundLiveCampaign['status']) {
  if (status === 'live') {
    return (
      <Badge variant="success" appearance="light" size="sm">
        Live
      </Badge>
    )
  }
  if (status === 'launching') {
    return (
      <Badge variant="warning" appearance="light" size="sm">
        Launching
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" appearance="light" size="sm">
      Paused
    </Badge>
  )
}

function LiveCampaignCard({ campaign }: { campaign: OutboundLiveCampaign }) {
  return (
    <div className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-neutral-900">{campaign.name}</h3>
            {statusBadge(campaign.status)}
          </div>
          <p className="mt-1 text-[13px] text-neutral-600">
            <span className="font-medium text-neutral-800">{campaign.offer}</span>
            <span className="text-neutral-400"> · </span>
            {campaign.vertical} · {campaign.location}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">{campaign.copyNotes}</p>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-semibold tabular-nums tracking-tight text-neutral-900">
            {campaign.progress}%
          </div>
          <div className="text-[11px] uppercase tracking-wide text-neutral-400">complete</div>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full bg-[#e85d2a] transition-[width] duration-500 ease-out"
          style={{ width: `${campaign.progress}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Leads" value={campaign.leadCount.toLocaleString()} />
        <Metric label="Sent" value={campaign.sendCount.toLocaleString()} />
        <Metric label="Left" value={campaign.remaining.toLocaleString()} />
        <Metric
          label="Performance"
          value={`${campaign.replyRate}% · ${campaign.positiveReplies} +ve · ${campaign.meetings} mtgs`}
        />
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200/60 bg-stone-50/60 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      <div className="mt-0.5 text-[13px] font-medium tabular-nums text-neutral-800">{value}</div>
    </div>
  )
}

export function OutboundLiveSection() {
  const [open, setOpen] = useState(false)
  const active = useMemo(() => listActiveOutboundCampaigns(), [])
  const top = active.slice(0, VISIBLE)
  const rest = active.slice(VISIBLE)

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Live</CardTitle>
          <CardDescription>
            Active outbound sequences — offer, copy notes, throughput, and completion
          </CardDescription>
        </div>
        <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          {active.filter((c) => c.status === 'live').length} live
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {top.length === 0 ? (
          <p className="text-sm text-neutral-500">No live campaigns yet.</p>
        ) : (
          top.map((c) => <LiveCampaignCard key={c.id} campaign={c} />)
        )}

        {rest.length > 0 ? (
          <div className="rounded-2xl border border-stone-200/70 bg-stone-50/40">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              aria-expanded={open}
            >
              <div>
                <div className="text-[13px] font-semibold text-neutral-900">
                  More live campaigns
                </div>
                <div className="text-[12px] text-neutral-500">
                  {rest.length} more · dropdown shows the next {DROPDOWN_WINDOW}; scroll for older
                </div>
              </div>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-neutral-500 transition-transform duration-200',
                  open && 'rotate-180'
                )}
              />
            </button>
            {open ? (
              <div className="max-h-[min(28rem,55vh)] space-y-3 overflow-y-auto border-t border-stone-200/70 px-4 py-4">
                {rest.map((c) => (
                  <LiveCampaignCard key={c.id} campaign={c} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
