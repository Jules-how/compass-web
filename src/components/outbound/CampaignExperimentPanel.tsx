'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  CTA_TYPES,
  EXPERIMENT_FACTORS,
  EXPERIMENT_ROLES,
  EXPERIMENT_STATUSES,
  experimentFactorLabel,
  experimentStatusLabel,
  type CompassCampaign
} from '@/lib/campaigns'
import { spawnChallenger } from '@/lib/campaigns-client'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import { computeOutcomeMetrics } from '@/lib/outbound-outcome-metrics'
import { useCachedJson } from '@/lib/use-cached-json'

const CONTROL =
  'w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] text-neutral-800 outline-none transition focus:border-neutral-400'

export function CampaignExperimentPanel({
  campaign,
  unbound,
  onChange,
  onChallengerSpawned
}: {
  campaign: CompassCampaign
  unbound?: boolean
  onChange: (patch: Partial<CompassCampaign>) => void
  onChallengerSpawned?: (campaignId: string) => void
}) {
  const [spawnOpen, setSpawnOpen] = useState(false)
  const [spawnFactor, setSpawnFactor] = useState('cta')
  const [spawnCtaType, setSpawnCtaType] = useState('timed_call')
  const [spawnBusy, setSpawnBusy] = useState(false)
  const board = useCachedJson<{ live: OutboundBoardCampaign[]; history: OutboundBoardCampaign[] }>(
    '/api/instantly/outbound-campaigns',
    '/api/instantly/outbound-campaigns',
    { staleMs: 60_000 }
  )
  const outcome = useMemo(() => {
    const rows = [...(board.data?.live ?? []), ...(board.data?.history ?? [])]
    const instantly = campaign.instantly_campaign_id
      ? rows.find((row) => row.id === campaign.instantly_campaign_id)
      : null
    return computeOutcomeMetrics(
      { sent: instantly?.sendCount ?? 0, bounced: instantly?.bouncedCount ?? 0 },
      {
        positive: campaign.wave_positive_count ?? instantly?.positiveReplies ?? 0,
        meetings: campaign.wave_meeting_count ?? instantly?.meetings ?? 0
      }
    )
  }, [
    board.data,
    campaign.instantly_campaign_id,
    campaign.wave_meeting_count,
    campaign.wave_positive_count
  ])
  const sampleTarget = campaign.sample_size_target ?? 150

  if (unbound) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-[15px] font-semibold text-neutral-900">Experiment</p>
        <p className="mt-2 text-sm text-neutral-500">
          Attach this draft to a pipeline campaign first — experiments live on Planner cards.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft">
        <div className="mb-4">
          <h2 className="text-[15px] font-semibold text-neutral-900">Experiment</h2>
          <p className="mt-1 text-[12px] text-neutral-500">
            One factor at a time. Control and challenger are separate Instantly campaigns.
          </p>
        </div>

        <div className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-neutral-500">Hypothesis</span>
            <textarea
              defaultValue={campaign.hypothesis ?? ''}
              key={`hyp-${campaign.id}-${campaign.updated_at}`}
              rows={3}
              placeholder="Permission CTA beats timed ask on reply rate (same offer/expression/structure)."
              className={CONTROL}
              onBlur={(e) => {
                const next = e.target.value.trim() || null
                if (next === (campaign.hypothesis ?? null)) return
                const patch: Partial<CompassCampaign> = { hypothesis: next }
                if (next && campaign.experiment_status === 'none') {
                  patch.experiment_status = 'queued'
                }
                if (next && campaign.experiment_role === 'none') {
                  patch.experiment_role = 'solo'
                }
                onChange(patch)
              }}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-neutral-500">Role</span>
              <select
                value={campaign.experiment_role || 'none'}
                onChange={(e) => onChange({ experiment_role: e.target.value })}
                className={CONTROL}
              >
                {EXPERIMENT_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role === 'none' ? 'None' : role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-neutral-500">Status</span>
              <select
                value={campaign.experiment_status || 'none'}
                onChange={(e) => onChange({ experiment_status: e.target.value })}
                className={CONTROL}
              >
                {EXPERIMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {experimentStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-neutral-500">Factor</span>
              <select
                value={campaign.experiment_factor || 'none'}
                onChange={(e) => onChange({ experiment_factor: e.target.value })}
                className={CONTROL}
              >
                {EXPERIMENT_FACTORS.map((factor) => (
                  <option key={factor} value={factor}>
                    {experimentFactorLabel(factor)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-neutral-500">Sample size</span>
              <input
                type="number"
                min={0}
                defaultValue={campaign.sample_size_target ?? ''}
                key={`sample-${campaign.id}-${campaign.sample_size_target}`}
                placeholder="150"
                className={CONTROL}
                onBlur={(e) => {
                  const raw = e.target.value.trim()
                  const next = raw === '' ? null : Math.max(0, Math.floor(Number(raw)))
                  if (next !== (campaign.sample_size_target ?? null)) {
                    onChange({ sample_size_target: next })
                  }
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-neutral-500">CTA type</span>
              <select
                value={campaign.cta_type || ''}
                onChange={(e) => onChange({ cta_type: e.target.value || null })}
                className={CONTROL}
              >
                <option value="">—</option>
                {CTA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-neutral-500">Expression key</span>
              <input
                type="text"
                defaultValue={campaign.expression_key ?? ''}
                key={`exprkey-${campaign.id}-${campaign.expression_key}`}
                placeholder="expr-growth-mortgage"
                className={CONTROL}
                onBlur={(e) => {
                  const next = e.target.value.trim() || null
                  if (next !== (campaign.expression_key ?? null)) {
                    onChange({ expression_key: next })
                  }
                }}
              />
            </label>
          </div>

          <p className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-[12px] text-neutral-600">
            Live N {outcome.delivered} / {sampleTarget} delivered · {outcome.positive} positive ·{' '}
            {outcome.meetingsPer100} meetings / 100
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-neutral-500">Decision notes</span>
            <textarea
              defaultValue={campaign.experiment_decision ?? ''}
              key={`dec-${campaign.id}-${campaign.experiment_decision}`}
              rows={2}
              placeholder="Winner call after sample gate…"
              className={CONTROL}
              onBlur={(e) => {
                const next = e.target.value.trim() || null
                if (next !== (campaign.experiment_decision ?? null)) {
                  onChange({ experiment_decision: next })
                }
              }}
            />
          </label>

          {campaign.parent_campaign_id ? (
            <p className="text-[12px] text-neutral-500">
              Parent:{' '}
              <Link
                href={`/sales/pipeline/${campaign.parent_campaign_id}`}
                className="font-medium text-[#c2410c] hover:underline"
              >
                {campaign.parent_campaign_id}
              </Link>
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={spawnBusy}
              onClick={() => setSpawnOpen((v) => !v)}
              className="rounded-xl bg-[#e85d2a] px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
            >
              Spawn challenger
            </button>
            <Link
              href={`/leads?pipeline_campaign_id=${encodeURIComponent(campaign.id)}`}
              className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-[12px] font-medium text-neutral-700"
            >
              Open leads in this campaign
            </Link>
          </div>

          {spawnOpen ? (
            <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/80 p-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-neutral-500">Factor to change</span>
                <select
                  value={spawnFactor}
                  onChange={(e) => setSpawnFactor(e.target.value)}
                  className={CONTROL}
                >
                  {EXPERIMENT_FACTORS.filter((f) => f !== 'none').map((factor) => (
                    <option key={factor} value={factor}>
                      {experimentFactorLabel(factor)}
                    </option>
                  ))}
                </select>
              </label>
              {spawnFactor === 'cta' ? (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-neutral-500">
                    Challenger CTA type
                  </span>
                  <select
                    value={spawnCtaType}
                    onChange={(e) => setSpawnCtaType(e.target.value)}
                    className={CONTROL}
                  >
                    {CTA_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                disabled={spawnBusy}
                onClick={() => {
                  setSpawnBusy(true)
                  void spawnChallenger(campaign.id, {
                    factor: spawnFactor,
                    cta_type: spawnFactor === 'cta' ? spawnCtaType : undefined,
                    hypothesis: campaign.hypothesis,
                    sample_size_target: campaign.sample_size_target
                  })
                    .then((created) => {
                      setSpawnOpen(false)
                      onChallengerSpawned?.(created.id)
                    })
                    .catch((err: Error) => {
                      window.alert(err.message || 'Spawn failed')
                    })
                    .finally(() => setSpawnBusy(false))
                }}
                className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-neutral-800 disabled:opacity-60"
              >
                {spawnBusy ? 'Spawning…' : 'Create challenger card'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
