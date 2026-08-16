'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  listCampaigns,
  updateCampaign
} from '@/lib/campaigns-client'
import type { CompassCampaign } from '@/lib/campaigns'
import {
  experimentFactorLabel,
  experimentStatusLabel
} from '@/lib/campaigns'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import {
  countFactorDifferences,
  enrichOutboundCampaignFactors,
  type OutboundFactorCampaign
} from '@/lib/outbound-factor-performance'
import { computeOutcomeMetrics } from '@/lib/outbound-outcome-metrics'
import { useCachedJson } from '@/lib/use-cached-json'

type OutboundBoardPayload = {
  live: OutboundBoardCampaign[]
  history: OutboundBoardCampaign[]
  source?: 'instantly' | 'demo' | 'error'
}

function metricsFor(
  campaign: CompassCampaign,
  board: OutboundFactorCampaign[]
): OutboundFactorCampaign | null {
  if (!campaign.instantly_campaign_id) return null
  return board.find((c) => c.id === campaign.instantly_campaign_id) || null
}

function ArmCard({
  campaign,
  metrics,
  label
}: {
  campaign: CompassCampaign
  metrics: OutboundFactorCampaign | null
  label: string
}) {
  const sent = metrics?.sendCount ?? 0
  const outcome = computeOutcomeMetrics(
    { sent, bounced: metrics?.bouncedCount ?? 0 },
    {
      positive: campaign.wave_positive_count ?? metrics?.positiveReplies ?? 0,
      meetings: campaign.wave_meeting_count ?? metrics?.meetings ?? 0
    }
  )
  const target = campaign.sample_size_target ?? 0
  const progress =
    target > 0 ? Math.min(100, Math.round((outcome.delivered / target) * 100)) : null
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            {label}
          </p>
          <Link
            href={`/sales/pipeline/${campaign.id}`}
            className="text-sm font-semibold text-neutral-900 hover:text-[#c2410c]"
          >
            {campaign.name}
          </Link>
        </div>
        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
          {experimentStatusLabel(campaign.experiment_status || 'none')}
        </span>
      </div>
      <p className="mt-2 text-xs text-neutral-600">
        {campaign.hypothesis || 'No hypothesis set.'}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-neutral-600">
        <div>
          <dt className="text-neutral-400">Offer</dt>
          <dd className="font-medium text-neutral-800">{campaign.offer_key || '—'}</dd>
        </div>
        <div>
          <dt className="text-neutral-400">Structure</dt>
          <dd className="font-medium text-neutral-800">{campaign.structure_id || '—'}</dd>
        </div>
        <div>
          <dt className="text-neutral-400">CTA type</dt>
          <dd className="font-medium text-neutral-800">{campaign.cta_type || '—'}</dd>
        </div>
        <div>
          <dt className="text-neutral-400">Expression</dt>
          <dd className="truncate font-medium text-neutral-800">
            {campaign.expression_key || '—'}
          </dd>
        </div>
      </dl>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="rounded-lg bg-stone-50 px-2 py-1.5">
          <div className="font-semibold text-neutral-900">{outcome.delivered}</div>
          <div className="text-neutral-400">Delivered</div>
        </div>
        <div className="rounded-lg bg-stone-50 px-2 py-1.5">
          <div className="font-semibold text-neutral-900">{outcome.positiveRate}%</div>
          <div className="text-neutral-400">Positive</div>
        </div>
        <div className="rounded-lg bg-stone-50 px-2 py-1.5">
          <div className="font-semibold text-neutral-900">{outcome.meetingsPer100}</div>
          <div className="text-neutral-400">Mtgs/100</div>
        </div>
      </div>
      {progress != null ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] text-neutral-500">
            <span>Sample progress</span>
            <span>
              {outcome.delivered}/{target}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-[#e85d2a]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function OutboundExperimentCompare() {
  const board = useCachedJson<OutboundBoardPayload>(
    '/api/instantly/outbound-campaigns',
    '/api/instantly/outbound-campaigns',
    { staleMs: 60_000 }
  )
  const [pipeline, setPipeline] = useState<CompassCampaign[]>([])
  const [controlId, setControlId] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void listCampaigns().then((rows) => {
      if (cancelled) return
      setPipeline(rows)
      const controls = rows.filter(
        (r) =>
          r.experiment_role === 'control' ||
          (r.experiment_status && r.experiment_status !== 'none')
      )
      if (!controlId && controls[0]) setControlId(controls[0].id)
    })
    return () => {
      cancelled = true
    }
  }, [controlId])

  const enrichedBoard = useMemo(() => {
    const live = board.data?.live ?? []
    const history = board.data?.history ?? []
    return [...live, ...history].map((c) => enrichOutboundCampaignFactors(c, pipeline))
  }, [board.data, pipeline])

  const control = pipeline.find((c) => c.id === controlId) || null
  const challengers = useMemo(
    () => pipeline.filter((c) => c.parent_campaign_id === controlId),
    [pipeline, controlId]
  )
  const challenger = challengers[0] || null

  const controlMetrics = control ? metricsFor(control, enrichedBoard) : null
  const challengerMetrics = challenger ? metricsFor(challenger, enrichedBoard) : null

  const mixed =
    controlMetrics && challengerMetrics
      ? countFactorDifferences(controlMetrics, challengerMetrics) > 1
      : false

  const controls = pipeline.filter(
    (r) =>
      r.experiment_role === 'control' ||
      r.experiment_role === 'solo' ||
      (r.experiment_status && r.experiment_status !== 'none')
  )

  async function setStatus(status: string, decision?: string) {
    if (!control) return
    setBusy(true)
    try {
      await updateCampaign(control.id, {
        experiment_status: status,
        experiment_decision: decision ?? control.experiment_decision
      })
      if (challenger) {
        const challengerStatus =
          status === 'won' ? 'lost' : status === 'lost' ? 'won' : status
        await updateCampaign(challenger.id, {
          experiment_status: challengerStatus,
          experiment_decision: decision ?? challenger.experiment_decision
        })
      }
      const rows = await listCampaigns({ force: true })
      setPipeline(rows)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Experiment compare</CardTitle>
          <CardDescription>
            Control vs challenger — one factor at a time. Separate Instantly campaigns only.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            Control campaign
          </span>
          <select
            value={controlId}
            onChange={(e) => setControlId(e.target.value)}
            className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[12px]"
          >
            <option value="">Select…</option>
            {controls.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.experiment_factor && c.experiment_factor !== 'none'
                  ? ` (${experimentFactorLabel(c.experiment_factor)})`
                  : ''}
              </option>
            ))}
          </select>
        </label>

        {!control ? (
          <p className="text-sm text-neutral-500">
            No experiment campaigns yet. Set a hypothesis on a Planner card or spawn a challenger.
          </p>
        ) : (
          <>
            {mixed ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Mixed factors — don’t call a single winner yet. Align on one changed dimension.
              </p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <ArmCard campaign={control} metrics={controlMetrics} label="Control" />
              {challenger ? (
                <ArmCard
                  campaign={challenger}
                  metrics={challengerMetrics}
                  label={`Challenger · ${experimentFactorLabel(challenger.experiment_factor || 'none')}`}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-3 text-sm text-neutral-500">
                  No challenger linked. Use Spawn challenger on the Planner card.
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['ready_to_call', 'Ready to call'],
                  ['won', 'Control wins'],
                  ['lost', 'Challenger wins'],
                  ['inconclusive', 'Inconclusive'],
                  ['killed', 'Kill']
                ] as const
              ).map(([status, label]) => (
                <button
                  key={status}
                  type="button"
                  disabled={busy}
                  onClick={() => void setStatus(status)}
                  className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-neutral-700 disabled:opacity-60"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
