'use client'

import { useEffect, useState } from 'react'
import type { LeadContact } from '@/lib/types'
import {
  RECONTACT_COOLDOWN_DAYS,
  computeRecontactEligibility,
  synthesizeTouchesFromLead,
  type LeadOutreachTouch,
  type RecontactEligibility
} from '@/lib/recontact-eligibility'
import { RecontactProgressRing } from '@/components/RecontactProgressRing'

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function LeadRecontactPanel({ lead }: { lead: LeadContact }) {
  const [eligibility, setEligibility] = useState<RecontactEligibility>(() =>
    computeRecontactEligibility(lead)
  )
  const [touches, setTouches] = useState<LeadOutreachTouch[]>(() =>
    synthesizeTouchesFromLead(lead).map((t) => ({
      ...t,
      created_at: t.contacted_at
    }))
  )
  const [source, setSource] = useState<'lead_mirror' | 'outreach_log'>('lead_mirror')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setEligibility(computeRecontactEligibility(lead))
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const res = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/outreach`, {
          headers: { Accept: 'application/json' }
        })
        if (!res.ok) return
        const body = (await res.json()) as {
          eligibility?: RecontactEligibility
          touches?: LeadOutreachTouch[]
          source?: 'lead_mirror' | 'outreach_log'
        }
        if (cancelled) return
        if (body.eligibility) setEligibility(body.eligibility)
        if (Array.isArray(body.touches) && body.touches.length > 0) {
          setTouches(body.touches)
          setSource(body.source === 'outreach_log' ? 'outreach_log' : 'lead_mirror')
        }
      } catch {
        // keep synthesized fallback
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [lead])

  const readyBanner =
    eligibility.recommendNewCampaign && eligibility.lane === 'ready' ? (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <span className="font-medium">Recommended: </span>
        Pull into a new campaign — {RECONTACT_COOLDOWN_DAYS} days since last outreach.
      </div>
    ) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <RecontactProgressRing eligibility={eligibility} size={52} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-neutral-900">{eligibility.label}</p>
          <p className="text-sm text-neutral-600">{eligibility.detail}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-500 sm:grid-cols-3">
            <div>
              <dt className="uppercase tracking-wide text-neutral-400">Last touch</dt>
              <dd className="text-neutral-800">{formatDate(eligibility.lastContactAt)}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-neutral-400">Days left</dt>
              <dd className="text-neutral-800">
                {eligibility.daysRemaining == null
                  ? '—'
                  : eligibility.daysRemaining === 0
                    ? '0 (ready)'
                    : String(eligibility.daysRemaining)}
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-neutral-400">Eligible from</dt>
              <dd className="text-neutral-800">{formatDate(eligibility.eligibleAt)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {readyBanner}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Outreach history
          </h4>
          {loading ? (
            <span className="text-[10px] text-neutral-400">Loading…</span>
          ) : (
            <span className="text-[10px] text-neutral-400">
              {source === 'outreach_log' ? 'From touch log' : 'From lead mirror'}
            </span>
          )}
        </div>
        {touches.length === 0 ? (
          <p className="text-sm text-neutral-500">No outreach recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {touches.map((touch) => (
              <li
                key={touch.id}
                className="rounded-xl border border-stone-200/80 bg-white px-3 py-2.5 shadow-soft"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-neutral-900">
                    {touch.campaign_name ||
                      (touch.instantly_campaign_id
                        ? `Campaign ${touch.instantly_campaign_id.slice(0, 8)}…`
                        : 'Outbound touch')}
                  </p>
                  <time className="text-xs text-neutral-500">{formatDate(touch.contacted_at)}</time>
                </div>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-neutral-400">
                  {touch.channel}
                  {touch.source ? ` · ${touch.source.replace(/_/g, ' ')}` : ''}
                </p>
                {touch.copy_snapshot?.preview || touch.copy_snapshot?.subject ? (
                  <p className="mt-2 text-sm text-neutral-700">
                    {touch.copy_snapshot.subject ? (
                      <span className="font-medium">{touch.copy_snapshot.subject}</span>
                    ) : null}
                    {touch.copy_snapshot.subject && touch.copy_snapshot.preview ? ' — ' : null}
                    {touch.copy_snapshot.preview &&
                    touch.copy_snapshot.preview !== touch.copy_snapshot.subject
                      ? touch.copy_snapshot.preview
                      : !touch.copy_snapshot.subject
                        ? touch.copy_snapshot.preview
                        : null}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-neutral-400">
                    Copy not linked yet — bind Instantly ID on a pipeline campaign to capture sequence text.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
