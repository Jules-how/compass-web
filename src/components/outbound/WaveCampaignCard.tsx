'use client'

import Link from 'next/link'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  dateOnlyInZone,
  testingVariableLabel,
  type CompassCampaign,
  type OfferWaveColumnId
} from '@/lib/campaigns'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import { formatWaveDate, INSTANTLY_CAMPAIGN_APP } from '@/lib/wave-desk'
import { cn } from '@/lib/utils'

function tradeFrom(campaign: CompassCampaign): string {
  return (campaign.vertical_tags ?? []).filter(Boolean)[0] || 'Trade'
}

function cityFrom(campaign: CompassCampaign): string {
  return (campaign.location_tags ?? []).filter(Boolean)[0] || 'City'
}

function statusChip(input: {
  column: OfferWaveColumnId | 'parked'
  instantly?: OutboundBoardCampaign
  campaign?: CompassCampaign | null
}): { label: string; variant: 'primary' | 'warning' | 'secondary' } {
  if (input.column === 'parked') return { label: 'Parked', variant: 'secondary' }
  const instantlyStatus = input.instantly?.status
  if (instantlyStatus === 'live') return { label: 'Sending', variant: 'primary' }
  if (instantlyStatus === 'launching') return { label: 'Launching', variant: 'warning' }
  if (instantlyStatus === 'paused') return { label: 'Paused', variant: 'warning' }
  if (input.column === 'recommended') return { label: 'Recommend', variant: 'primary' }
  if (input.column === 'live') return { label: 'Live in Compass', variant: 'primary' }
  return { label: 'Queued', variant: 'secondary' }
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-neutral-900">{value}</p>
    </div>
  )
}

export function WaveCampaignCard({
  campaign,
  column,
  instantly,
  sends,
  replies,
  remaining,
  decisionLabel,
  onPromote
}: {
  campaign?: CompassCampaign | null
  column: OfferWaveColumnId | 'parked'
  instantly?: OutboundBoardCampaign
  sends: number
  replies: number
  remaining?: number
  decisionLabel?: string
  onPromote?: (campaign: CompassCampaign) => void
}) {
  const native = !campaign && Boolean(instantly)
  const href = campaign ? `/sales/outbound/editor/${encodeURIComponent(campaign.id)}` : null
  const instantlyHref = instantly ? INSTANTLY_CAMPAIGN_APP(instantly.id) : null
  const goLiveRaw = campaign?.go_live_at
    ? dateOnlyInZone(campaign.go_live_at)
    : campaign?.start_date || instantly?.startedAt || null
  const goLive = formatWaveDate(goLiveRaw)
  const listSize = campaign?.wave_list_size ?? campaign?.wave_cohort_count ?? 0
  const testing = campaign ? testingVariableLabel(campaign.testing_variable) : ''
  const color = campaign?.color || (column === 'live' || instantly?.status === 'live' ? '#e85d2a' : '#d6d3d1')
  const chip = statusChip({ column, instantly, campaign })
  const summary =
    column === 'recommended'
      ? campaign?.wave_rationale || campaign?.summary || 'No rationale yet.'
      : campaign?.summary || campaign?.wave_approach || campaign?.hypothesis || instantly?.copyNotes || ''

  return (
    <Card className={cn('folio-wave-card overflow-hidden', column === 'parked' && 'opacity-90')}>
      <div className="flex min-h-0">
        <div className="w-1 shrink-0 self-stretch" style={{ background: color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <CardHeader className="items-start">
            <div className="w-full space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {campaign ? (
                  <Badge variant="secondary" appearance="light" size="sm">
                    {tradeFrom(campaign)} · {cityFrom(campaign)}
                  </Badge>
                ) : (
                  <Badge variant="secondary" appearance="light" size="sm">
                    Instantly
                  </Badge>
                )}
                <Badge variant={chip.variant} appearance="light" size="sm">
                  {chip.label}
                </Badge>
                {native ? (
                  <Badge variant="outline" size="sm">
                    Not in Compass
                  </Badge>
                ) : null}
              </div>
              <CardTitle className="text-[15px] leading-snug">
                {href ? (
                  <Link href={href} className="hover:text-[#c2410c] hover:underline">
                    {campaign?.name}
                  </Link>
                ) : (
                  instantly?.name || 'Untitled'
                )}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {summary ? <p className="line-clamp-2 text-[13px] leading-relaxed text-neutral-500">{summary}</p> : null}
            {column === 'recommended' ? (
              <p className="text-[12px] text-neutral-500">
                {listSize ? `${listSize} leads` : 'List size unset'}
                {campaign?.offer_key ? ` · ${campaign.offer_key}` : ''}
                {campaign?.wave_copy_strategy ? ` · ${campaign.wave_copy_strategy}` : ''}
              </p>
            ) : null}
            {column === 'next' ? (
              <p className="text-[12px] text-neutral-500">
                {goLive ? `Go live ${goLive}` : 'Go live unset'}
                {campaign?.offer_key ? ` · ${campaign.offer_key}` : ''}
                {testing && testing !== 'None' ? ` · ${testing}` : ''}
              </p>
            ) : null}
            {column === 'live' || column === 'parked' ? (
              <div className="grid grid-cols-3 gap-3">
                <Metric label="Sent" value={sends} />
                <Metric label="Replies" value={replies} />
                <Metric label="Left" value={remaining ?? instantly?.remaining ?? '—'} />
              </div>
            ) : null}
            {decisionLabel && (column === 'live' || column === 'parked') ? (
              <p className="text-[12px] text-neutral-500">{decisionLabel}</p>
            ) : null}
            {campaign?.wave_approach && column === 'recommended' ? (
              <p className="text-[12px] text-neutral-400">{campaign.wave_approach}</p>
            ) : null}
          </CardContent>
          <CardFooter className="justify-between gap-2">
            {href ? (
              <Link
                href={href}
                className="flex items-center text-[12px] font-medium text-neutral-800 hover:underline"
              >
                Open copy
                <ArrowRight className="ml-1.5 size-3.5" />
              </Link>
            ) : (
              <span className="text-[12px] text-neutral-400">Compass has no row yet</span>
            )}
            <div className="flex items-center gap-3">
              {instantlyHref ? (
                <a
                  href={instantlyHref}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center text-[12px] font-medium text-[#c2410c] hover:underline"
                >
                  Instantly
                  <ArrowUpRight className="ml-1 size-3.5" />
                </a>
              ) : null}
              {onPromote && campaign && column === 'recommended' ? (
                <button
                  type="button"
                  onClick={() => onPromote(campaign)}
                  className="text-[12px] font-semibold text-[#c2410c]"
                >
                  Move to next
                </button>
              ) : null}
            </div>
          </CardFooter>
        </div>
      </div>
    </Card>
  )
}

export function WaveEmptyColumn({ label }: { label: string }) {
  return (
    <p className={cn('rounded-2xl border border-dashed border-stone-200 px-5 py-8 text-[13px] text-neutral-400')}>
      {label}
    </p>
  )
}
