'use client'

import { RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useCachedJson } from '@/lib/use-cached-json'
import type { InstantlyUiCampaignStatus, SequenceCampaignAnalytics } from '@/lib/instantly'
import { cn } from '@/lib/utils'

type AnalyticsPayload = SequenceCampaignAnalytics & {
  source?: 'instantly' | 'demo' | 'error'
  warning?: string
  error?: string
  detail?: string
}

function statusBadge(status: InstantlyUiCampaignStatus) {
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

export function SequenceAnalyticsPanel({
  instantlyCampaignId,
  onOpenSettings
}: {
  instantlyCampaignId: string | null | undefined
  onOpenSettings?: () => void
}) {
  const id = instantlyCampaignId?.trim() || null
  const url = id ? `/api/instantly/campaigns/${encodeURIComponent(id)}/analytics` : null
  const { data, error, loading, reload } = useCachedJson<AnalyticsPayload>(
    url,
    url,
    { staleMs: 60_000 }
  )

  if (!id) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-[15px] font-semibold text-neutral-900">Analytics</p>
        <p className="mt-2 text-sm text-neutral-500">
          Link an Instantly campaign id in Settings to pull live send, reply, and progress
          metrics for this sequence.
        </p>
        {onOpenSettings ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-[#e85d2a] px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-[#d14e1f]"
          >
            Open Settings
          </button>
        ) : null}
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-neutral-500">
        Loading Instantly analytics…
      </div>
    )
  }

  const fetchFailed = Boolean(error) || data?.source === 'error' || Boolean(data?.error)
  if (fetchFailed && !data?.campaignId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-[15px] font-semibold text-neutral-900">Couldn’t load analytics</p>
        <p className="mt-2 text-sm text-neutral-500">
          {data?.detail || error || 'Instantly is unavailable right now.'}
        </p>
        <p className="mt-1 text-[12px] text-neutral-400">Campaign id: {id}</p>
        <button
          type="button"
          onClick={() => void reload(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-soft transition hover:bg-stone-50"
        >
          <RefreshCw className="size-3.5" />
          Retry
        </button>
      </div>
    )
  }

  const metrics = data as SequenceCampaignAnalytics

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8">
      <div className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold text-neutral-900">
                {metrics.campaignName}
              </h3>
              {statusBadge(metrics.status)}
              {data?.source === 'demo' ? (
                <Badge variant="outline" size="sm">
                  Demo
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-[12px] text-neutral-500">
              Instantly · <span className="font-mono text-[11px]">{metrics.campaignId}</span>
            </p>
            {data?.warning ? (
              <p className="mt-2 text-[12px] text-amber-700">{data.warning}</p>
            ) : null}
          </div>
          <div className="flex items-start gap-3">
            <div className="text-right">
              <div className="text-[22px] font-semibold tabular-nums tracking-tight text-neutral-900">
                {metrics.progress}%
              </div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-400">complete</div>
            </div>
            <button
              type="button"
              onClick={() => void reload(true)}
              className="rounded-xl p-2 text-neutral-400 transition hover:bg-stone-50 hover:text-neutral-700"
              aria-label="Refresh analytics"
            >
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-[#e85d2a] transition-[width] duration-500 ease-out"
            style={{ width: `${metrics.progress}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Leads" value={metrics.leads.toLocaleString()} />
          <Metric label="Contacted" value={metrics.contacted.toLocaleString()} />
          <Metric label="Sent" value={metrics.sent.toLocaleString()} />
          <Metric label="Left" value={metrics.remaining.toLocaleString()} />
          <Metric label="Replies" value={metrics.replies.toLocaleString()} />
          <Metric
            label="Performance"
            value={`${metrics.replyRate}% · ${metrics.opportunities} mtgs`}
          />
        </div>
      </div>
    </div>
  )
}
