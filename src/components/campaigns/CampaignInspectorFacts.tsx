'use client'

import Link from 'next/link'
import { campaignReadiness } from '@/lib/campaign-queue'
import { copyStatusLabel, normalizeCopyStatus } from '@/lib/outbound-copy'
import type { CompassCampaign } from '@/lib/campaigns'
import type { WaveSnapshot } from '@/lib/campaign-wave'

export function CampaignInspectorFacts({
  campaign,
  wave,
  leadTotal
}: {
  campaign: CompassCampaign | null
  wave?: WaveSnapshot | null
  leadTotal?: number
}) {
  if (!campaign) return null

  const cohort = wave?.cohort ?? campaign.wave_cohort_count ?? leadTotal ?? 0
  const openers = wave?.openers ?? campaign.wave_opener_count ?? 0
  const sendable = Math.max(0, cohort - (wave?.thin || 0) - (wave?.skip || 0))
  const bound = Boolean((campaign.instantly_campaign_id || '').trim())
  const copy = normalizeCopyStatus(campaign.copy_status)
  const offer = (campaign.offer_key || '').trim()
  const vertical = campaign.vertical_tags?.[0]
  const readiness = campaignReadiness({
    cohort,
    copy_status: campaign.copy_status || 'none',
    bound
  })
  const instantlyLabel = bound
    ? campaign.status === 'active' || copy === 'live'
      ? 'Live'
      : 'Bound'
    : 'Not bound'
  const readyHref = vertical
    ? `/leads?vertical=${encodeURIComponent(vertical)}&recontact_ready=1`
    : '/leads?recontact_ready=1'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Fact label="Offer" value={offer || 'None'} muted={!offer} />
        <Fact
          label="Leads"
          value={cohort > 0 ? String(cohort) : 'None'}
          muted={cohort === 0}
        />
        <Fact
          label="Openers"
          value={cohort > 0 ? `${openers} / ${sendable || cohort}` : '—'}
          muted={cohort === 0 || openers < sendable}
        />
        <Fact label="Instantly" value={instantlyLabel} muted={!bound} />
      </div>
      <p className="text-[12px] text-neutral-500">
        {readiness.ready
          ? 'Ready to activate in Instantly.'
          : `Needs ${readiness.blockers.join(' · ')}.`}
        {copy !== 'none' ? ` · Copy ${copyStatusLabel(copy).toLowerCase()}` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/leads?pipeline_campaign_id=${encodeURIComponent(campaign.id)}`}
          className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 shadow-soft hover:bg-stone-50"
        >
          Leads on this campaign
        </Link>
        <Link
          href={readyHref}
          className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 shadow-soft hover:bg-stone-50"
        >
          Ready to add
        </Link>
        <Link
          href={`/sales/outbound/editor/${encodeURIComponent(campaign.id)}`}
          className="rounded-xl bg-[#e85d2a] px-3 py-1.5 text-[12px] font-semibold text-white shadow-soft"
        >
          Open editor
        </Link>
      </div>
    </div>
  )
}

function Fact({
  label,
  value,
  muted
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-stone-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      <p className={`mt-0.5 truncate text-[13px] font-semibold ${muted ? 'text-neutral-400' : 'text-neutral-900'}`}>
        {value}
      </p>
    </div>
  )
}
