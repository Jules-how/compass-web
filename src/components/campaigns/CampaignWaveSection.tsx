'use client'

import type { CampaignPatch } from '@/lib/campaigns-client'
import type { WaveSnapshot } from '@/lib/campaign-wave'

export function CampaignWaveSection({
  wave,
  onSave
}: {
  wave: WaveSnapshot | null
  onSave: (patch: CampaignPatch) => void
}) {
  if (!wave) {
    return <p className="text-sm text-neutral-500">Loading wave…</p>
  }

  const reviewed = Boolean(wave.openerReviewedAt)
  const confirmed = Boolean(wave.copyConfirmedAt)
  const bounce = wave.instantly
  const failing = wave.checks.filter((check) => check.blocking && !check.ok)

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-neutral-500">Cohort</span>
        <p className="rounded-xl border border-stone-200/80 bg-stone-50 px-3.5 py-2 text-sm text-neutral-800">
          {wave.cohort}
        </p>
      </div>
      <p className="text-[12px] text-neutral-600">
        Openers {wave.openers} / {wave.cohort}
        {wave.missingCompanyOrEmail > 0
          ? ` · ${wave.missingCompanyOrEmail} missing company or email`
          : ''}
      </p>

      <ul className="space-y-1">
        {wave.checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-[12px]">
            <span
              className={
                check.ok
                  ? 'text-emerald-700'
                  : check.warn
                    ? 'text-amber-700'
                    : 'text-neutral-500'
              }
            >
              {check.ok ? '✓' : check.warn ? '!' : '–'}
            </span>
            <span className="min-w-0">
              <span className="font-medium text-neutral-800">{check.label}</span>
              <span className="text-neutral-500"> · {check.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <label className="flex items-center gap-2.5 text-[12px] text-neutral-700">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) =>
            onSave({
              opener_reviewed_at: e.target.checked ? new Date().toISOString() : null
            })
          }
          className="h-4 w-4 rounded-md border-stone-300 text-[#e85d2a] accent-[#e85d2a]"
        />
        I read every opener
      </label>

      {bounce ? (
        <p className="text-[12px] text-neutral-600">
          Bounce {bounce.bounceRate}% ({bounce.bounced} / {bounce.sent} sent)
        </p>
      ) : (
        <p className="text-[12px] text-neutral-400">Bounce — no Instantly volume yet</p>
      )}

      {!confirmed ? (
        <button
          type="button"
          onClick={() => onSave({ copy_confirmed_at: new Date().toISOString() })}
          className="compass-btn-secondary text-[12px]"
        >
          Compass copy matches Instantly
        </button>
      ) : (
        <p className="text-[12px] text-emerald-800">Copy match confirmed</p>
      )}

      {wave.readyToActivate ? (
        <p className="rounded-xl border border-emerald-200/80 bg-emerald-50 px-3.5 py-2.5 text-[12px] font-medium text-emerald-900">
          Ready for you to activate in Instantly
        </p>
      ) : (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-950">
          Blocked
          {failing.length > 0
            ? ` — ${failing.map((check) => check.label.toLowerCase()).join(', ')}`
            : ''}
        </p>
      )}
    </div>
  )
}
