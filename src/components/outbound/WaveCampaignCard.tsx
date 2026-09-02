'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  dateOnlyInZone,
  testingVariableLabel,
  type CompassCampaign,
  type OfferWaveColumnId
} from '@/lib/campaigns'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import { cn } from '@/lib/utils'

function tradeFrom(campaign: CompassCampaign): string {
  return (campaign.vertical_tags ?? []).filter(Boolean)[0] || 'Trade'
}

function cityFrom(campaign: CompassCampaign): string {
  return (campaign.location_tags ?? []).filter(Boolean)[0] || 'City'
}

export function WaveCampaignCard({
  campaign,
  column,
  instantly,
  sends,
  replies,
  decisionLabel,
  onPromote
}: {
  campaign: CompassCampaign
  column: OfferWaveColumnId
  instantly?: OutboundBoardCampaign
  sends: number
  replies: number
  decisionLabel?: string
  onPromote?: (campaign: CompassCampaign) => void
}) {
  const href = `/sales/outbound/editor/${encodeURIComponent(campaign.id)}`
  const goLive = campaign.go_live_at ? dateOnlyInZone(campaign.go_live_at) : campaign.start_date
  const listSize = campaign.wave_list_size ?? campaign.wave_cohort_count ?? 0
  const summary =
    column === 'recommended'
      ? campaign.wave_rationale || campaign.summary || 'No rationale yet.'
      : campaign.summary || campaign.wave_approach || campaign.hypothesis || 'No notes yet.'

  return (
    <Card className="grid grid-rows-[auto_auto_1fr_auto] overflow-hidden border-stone-200/80 shadow-soft">
      <div
        className="flex aspect-[16/9] max-h-24 w-full items-end px-3 py-2"
        style={{ background: campaign.color || '#e7e5e4' }}
      >
        <Badge variant="secondary" appearance="light" size="sm">
          {tradeFrom(campaign)} · {cityFrom(campaign)}
        </Badge>
      </div>
      <CardHeader className="space-y-1 p-3 pb-2">
        <CardTitle className="text-[13px] font-semibold leading-snug">
          <Link href={href} className="hover:text-[#c2410c] hover:underline">
            {campaign.name}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 p-3 pt-0 text-[12px] text-neutral-600">
        <p className="line-clamp-4 text-neutral-500">{summary}</p>
        {column === 'recommended' ? (
          <p>
            {listSize || 150} leads · {campaign.offer_key || 'booked-jobs-system'}
            {campaign.wave_copy_strategy ? ` · ${campaign.wave_copy_strategy}` : ''}
          </p>
        ) : null}
        {column === 'next' ? (
          <p>
            Go live {goLive || 'unset'} · {campaign.offer_key || 'offer unset'} ·{' '}
            {testingVariableLabel(campaign.testing_variable)}
          </p>
        ) : null}
        {column === 'live' ? (
          <p>
            {instantly?.status || campaign.status} · {sends} sent · {replies} replies
            {decisionLabel ? ` · ${decisionLabel}` : ''}
          </p>
        ) : null}
        {campaign.wave_approach && column !== 'next' ? (
          <p className="text-neutral-400">{campaign.wave_approach}</p>
        ) : null}
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2 p-3 pt-0">
        <Link href={href} className="flex items-center text-[12px] font-medium text-neutral-800 hover:underline">
          Open
          <ArrowRight className="ml-1.5 size-3.5" />
        </Link>
        {onPromote && column === 'recommended' ? (
          <button
            type="button"
            onClick={() => onPromote(campaign)}
            className="text-[11px] font-semibold text-[#c2410c]"
          >
            Move to next
          </button>
        ) : null}
      </CardFooter>
    </Card>
  )
}

export function WaveEmptyColumn({ label }: { label: string }) {
  return (
    <p className={cn('rounded-2xl border border-dashed border-stone-200 px-3 py-6 text-[12px] text-neutral-400')}>
      {label}
    </p>
  )
}
