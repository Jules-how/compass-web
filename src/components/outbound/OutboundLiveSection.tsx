'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

const VISIBLE = 8
const DROPDOWN_WINDOW = 12

type OutboundBoardPayload = {
  live: OutboundBoardCampaign[]
  history: OutboundBoardCampaign[]
  liveCount: number
  source?: 'instantly' | 'demo' | 'error'
  warning?: string
}

function statusBadge(status: OutboundBoardCampaign['status']) {
  if (status === 'live') {
    return (
      <Badge variant="success" appearance="light" size="sm">
        Active
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

function liveHref(campaign: OutboundBoardCampaign): string {
  if (campaign.pipelineCampaignId) {
    return `/sales/outbound/editor/${encodeURIComponent(campaign.pipelineCampaignId)}`
  }
  return `/sales/outbound/editor/live/${encodeURIComponent(campaign.id)}`
}

function LiveRow({ campaign }: { campaign: OutboundBoardCampaign }) {
  return (
    <Link
      href={liveHref(campaign)}
      className="grid grid-cols-[minmax(0,1.6fr)_auto_minmax(4.5rem,0.7fr)_minmax(4rem,0.55fr)_minmax(4rem,0.55fr)_minmax(4.5rem,0.6fr)_minmax(4.5rem,0.7fr)] items-center gap-2 border-b border-stone-100 px-3 py-2 text-[13px] transition last:border-b-0 hover:bg-orange-50/50"
    >
      <div className="min-w-0">
        <div className="truncate font-medium text-neutral-900">{campaign.name}</div>
        {campaign.offer ? (
          <div className="truncate text-[11px] text-neutral-500">{campaign.offer}</div>
        ) : null}
      </div>
      <div>{statusBadge(campaign.status)}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-[#e85d2a]"
              style={{ width: `${Math.min(100, Math.max(0, campaign.progress))}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right tabular-nums text-[11px] text-neutral-500">
            {campaign.progress}%
          </span>
        </div>
      </div>
      <div className="tabular-nums text-neutral-700">{campaign.sendCount.toLocaleString()}</div>
      <div className="tabular-nums text-neutral-700">{campaign.remaining.toLocaleString()}</div>
      <div className="tabular-nums text-neutral-700">
        {campaign.replyCount.toLocaleString()}
        <span className="ml-1 text-[11px] text-neutral-400">{campaign.replyRate}%</span>
      </div>
      <div className="tabular-nums text-neutral-700">{campaign.opportunities.toLocaleString()}</div>
    </Link>
  )
}

function TableHead() {
  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_auto_minmax(4.5rem,0.7fr)_minmax(4rem,0.55fr)_minmax(4rem,0.55fr)_minmax(4.5rem,0.6fr)_minmax(4.5rem,0.7fr)] items-center gap-2 border-b border-stone-200 bg-stone-50/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
      <div>Name</div>
      <div>Status</div>
      <div>Progress</div>
      <div>Sent</div>
      <div>Left</div>
      <div>Reply rate</div>
      <div>Opportunities</div>
    </div>
  )
}

export function OutboundLiveSection() {
  const [open, setOpen] = useState(false)
  const board = useCachedJson<OutboundBoardPayload>(
    '/api/instantly/outbound-campaigns',
    '/api/instantly/outbound-campaigns',
    { staleMs: 60_000 }
  )
  const active = board.data?.live ?? []
  const liveCount = board.data?.liveCount ?? 0
  const fromInstantly = board.data?.source === 'instantly'
  const fromDemo = board.data?.source === 'demo'
  const fromError = board.data?.source === 'error' || Boolean(board.error && !board.data)
  const top = active.slice(0, VISIBLE)
  const rest = active.slice(VISIBLE)

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Live</CardTitle>
          <CardDescription>
            Active Instantly campaigns — compact send volume, replies, and opportunities
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {board.loading && !board.data ? (
            <span className="text-[11px] font-medium text-neutral-400">Loading…</span>
          ) : (
            <span
              className={cn(
                'rounded-xl px-2.5 py-1 text-[11px] font-semibold',
                fromInstantly
                  ? 'bg-emerald-50 text-emerald-700'
                  : fromError
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-amber-50 text-amber-800'
              )}
            >
              {fromInstantly
                ? `${liveCount} live · Instantly`
                : fromError
                  ? 'Instantly unavailable'
                  : `${liveCount} live · demo`}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {fromError ? (
          <p className="text-sm text-amber-800">
            Instantly is unavailable right now — live metrics will show when it reconnects.
          </p>
        ) : null}
        {fromDemo && !fromError ? (
          <p className="text-sm text-amber-800">
            Instantly API key is not configured — showing sample campaigns. Add the key in Settings
            or <code className="text-[12px]">INSTANTLY_API_KEY</code>.
          </p>
        ) : null}

        {top.length === 0 && !board.loading ? (
          <p className="text-sm text-neutral-500">
            {fromError ? 'No live metrics to show.' : 'No live campaigns yet.'}
          </p>
        ) : null}

        {top.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-stone-200/80">
            <TableHead />
            {top.map((c) => (
              <LiveRow key={c.id} campaign={c} />
            ))}
          </div>
        ) : null}

        {rest.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-stone-200/70 bg-stone-50/40">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              aria-expanded={open}
            >
              <div>
                <div className="text-[13px] font-semibold text-neutral-900">More live campaigns</div>
                <div className="text-[12px] text-neutral-500">
                  {rest.length} more · shows the next {DROPDOWN_WINDOW}; scroll for older
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
              <div className="max-h-[min(22rem,45vh)] overflow-y-auto border-t border-stone-200/70">
                {rest.map((c) => (
                  <LiveRow key={c.id} campaign={c} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
