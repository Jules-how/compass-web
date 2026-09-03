'use client'

import { COLD_EMAIL_LEVERS, COLD_EMAIL_QUESTIONS, countPulledLevers, questionIsAnswered } from '@/lib/outbound-levers'
import type { CompassCampaign } from '@/lib/campaigns'
import type { OutboundSequence } from '@/lib/outbound-copy'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import { computeOutcomeMetrics } from '@/lib/outbound-outcome-metrics'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

type BoardPayload = {
  live?: OutboundBoardCampaign[]
  history?: OutboundBoardCampaign[]
}

const QUESTION_LEVER_IDS = new Set<string>(COLD_EMAIL_QUESTIONS.map((q) => q.leverId))

export function ComposeRatesStrip({ campaign }: { campaign: CompassCampaign }) {
  const instantlyId = campaign.instantly_campaign_id?.trim()
  const board = useCachedJson<BoardPayload>(
    '/api/instantly/outbound-campaigns',
    '/api/instantly/outbound-campaigns',
    { staleMs: 60_000 }
  )
  const row = [...(board.data?.live ?? []), ...(board.data?.history ?? [])].find(
    (c) => c.id === instantlyId
  )
  if (!instantlyId && !campaign.wave_positive_count) {
    return (
      <p className="text-[12px] text-pretty text-neutral-500">
        No Instantly bind yet. Rates show here after you push.
      </p>
    )
  }
  const outcome = computeOutcomeMetrics(
    { sent: row?.sendCount ?? 0, bounced: row?.bouncedCount ?? 0 },
    {
      positive: campaign.wave_positive_count ?? row?.positiveReplies ?? 0,
      meetings: campaign.wave_meeting_count ?? row?.meetings ?? 0
    }
  )
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {[
        { label: 'Sent', value: row?.sendCount ? row.sendCount.toLocaleString() : '—' },
        { label: 'Positive', value: outcome.positive ? String(outcome.positive) : '—' },
        { label: 'Positive / delivered', value: outcome.delivered ? `${outcome.positiveRate}%` : '—' },
        { label: 'Meetings / 100', value: outcome.delivered ? String(outcome.meetingsPer100) : '—' }
      ].map((m) => (
        <div key={m.label}>
          <div className="text-[11px] font-medium text-neutral-500">{m.label}</div>
          <div className="mt-0.5 text-[13px] font-semibold tabular-nums text-neutral-900">{m.value}</div>
        </div>
      ))}
    </div>
  )
}


export function ComposeRecipeStrip({
  bits,
  onFocusSlot
}: {
  bits: Array<{ id: string; label: string; value: string; slotKey?: string }>
  onFocusSlot?: (slotKey: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {bits.map((bit) => (
        <button
          key={bit.id}
          type="button"
          onClick={() => {
            if (bit.slotKey && onFocusSlot) onFocusSlot(bit.slotKey)
          }}
          className={cn(
            'rounded-xl px-2.5 py-1.5 text-left',
            bit.value ? 'bg-stone-50' : 'border border-dashed border-stone-200 bg-white'
          )}
        >
          <div className="text-[10px] font-medium text-neutral-400">{bit.label}</div>
          <div className="mt-0.5 max-w-[11rem] truncate text-[12px] font-medium text-neutral-800">
            {bit.value || 'empty'}
          </div>
        </button>
      ))}
    </div>
  )
}

export function ComposeLeversPanel({
  sequence,
  onFocusSlot,
  className
}: {
  sequence: OutboundSequence | null
  onFocusSlot?: (slotKey: string) => void
  className?: string
}) {
  const tally = countPulledLevers(sequence)
  const extraLevers = COLD_EMAIL_LEVERS.filter(
    (lever) => lever.id !== 'cta_worth' && !QUESTION_LEVER_IDS.has(lever.id)
  )

  return (
    <div className={cn('flex min-h-0 flex-col overflow-y-auto p-4', className)}>
      <p className="text-[11px] font-semibold text-neutral-400">Six questions</p>
      <p className="mt-0.5 text-[12px] text-pretty text-neutral-500">
        Miss one and you hand them an exit. Strong emails usually land four or five levers.
      </p>
      <p className="mt-2 text-[12px] font-semibold tabular-nums text-neutral-700">
        {tally.pulled} of {tally.copyLevers} copy levers filled
      </p>
      <ol className="mt-3 space-y-1.5">
        {COLD_EMAIL_QUESTIONS.map((q) => {
          const answered = questionIsAnswered(q, sequence)
          const lever = COLD_EMAIL_LEVERS.find((l) => l.id === q.leverId || (q.leverId === 'cta_effort' && l.id === 'cta_worth'))
          return (
            <li key={q.id}>
              <button
                type="button"
                disabled={!lever?.slotKeys[0]}
                onClick={() => {
                  if (lever?.slotKeys[0] && onFocusSlot) onFocusSlot(lever.slotKeys[0])
                }}
                className="flex w-full items-start gap-2 rounded-xl bg-stone-50/80 px-2.5 py-2 text-left disabled:cursor-default"
              >
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[#c2410c]">
                  {q.n}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-neutral-800">{q.question}</p>
                  {lever ? (
                    <p className="mt-0.5 text-[11px] text-pretty text-neutral-500">{lever.body}</p>
                  ) : null}
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    answered ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
                  )}
                >
                  {answered ? 'In' : 'Off'}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <p className="mb-2 mt-4 text-[11px] font-semibold text-neutral-400">More levers</p>
      <ul className="space-y-1.5">
        {extraLevers.map((lever) => {
          const pull = tally.pulls.find((p) => p.id === lever.id)
          return (
            <li key={lever.id}>
              <button
                type="button"
                disabled={lever.listWork || !lever.slotKeys[0]}
                onClick={() => {
                  if (lever.slotKeys[0] && onFocusSlot) onFocusSlot(lever.slotKeys[0])
                }}
                className="w-full rounded-xl bg-stone-50/80 px-2.5 py-2 text-left disabled:cursor-default"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-neutral-800">{lever.name}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                      lever.listWork
                        ? 'bg-stone-100 text-neutral-500'
                        : pull?.pulled
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-amber-50 text-amber-900'
                    )}
                  >
                    {lever.listWork ? 'List' : pull?.pulled ? 'In' : 'Off'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-pretty text-neutral-500">{lever.body}</p>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
