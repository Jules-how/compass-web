'use client'

import { useState } from 'react'
import type { CompassCampaign } from '@/lib/campaigns'
import {
  ensureInstantlyCampaign,
  pushInstantlyLeads,
  pushInstantlySequence,
  type InstantlyPushLeadsClientResult
} from '@/lib/campaigns-client'

function skipLabel(reason: string): string {
  switch (reason) {
    case 'no_email':
      return 'no email'
    case 'suppressed':
      return 'suppressed'
    case 'hot':
      return 'already in pipeline'
    case 'already_in_campaign':
      return 'already in this Instantly campaign'
    case 'missing_opener':
      return 'missing opener'
    default:
      return reason
  }
}

export function CampaignInstantlyPanel({
  campaign,
  onCampaignChange,
  compact
}: {
  campaign: CompassCampaign | null
  onCampaignChange?: (campaign: CompassCampaign) => void
  compact?: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [preview, setPreview] = useState<InstantlyPushLeadsClientResult | null>(null)

  const campaignId = campaign?.id?.trim() || ''
  const bound = Boolean(campaign?.instantly_campaign_id?.trim())
  const disabled = !campaignId || campaignId.startsWith('instantly-')

  async function run(label: string, fn: () => Promise<void>) {
    if (disabled) return
    setBusy(label)
    setError(null)
    setNote(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <p className="text-[12px] leading-relaxed text-neutral-600">
        Push copy and leads into Instantly from Compass. Campaign stays paused. You activate in
        Instantly after sign-off.
      </p>
      {bound ? (
        <p className="break-all text-[11px] text-neutral-500">
          Instantly id {campaign?.instantly_campaign_id}
        </p>
      ) : (
        <p className="text-[11px] text-neutral-500">Not bound yet. Create a paused Instantly campaign.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || Boolean(busy)}
          onClick={() =>
            void run('ensure', async () => {
              const result = await ensureInstantlyCampaign(campaignId)
              onCampaignChange?.(result.campaign)
              setNote(
                result.created
                  ? 'Created a paused Instantly campaign and bound it.'
                  : 'Already bound. Instantly campaign is still there.'
              )
            })
          }
          className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-neutral-800 shadow-soft disabled:opacity-50"
        >
          {busy === 'ensure' ? 'Working…' : bound ? 'Check Instantly bind' : 'Create in Instantly'}
        </button>
        <button
          type="button"
          disabled={disabled || !bound || Boolean(busy)}
          onClick={() =>
            void run('sequence', async () => {
              const result = await pushInstantlySequence(campaignId)
              setNote(`Pushed ${result.steps} step${result.steps === 1 ? '' : 's'}. Still paused.`)
            })
          }
          className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-neutral-800 shadow-soft disabled:opacity-50"
        >
          {busy === 'sequence' ? 'Pushing…' : 'Push copy'}
        </button>
        <button
          type="button"
          disabled={disabled || !bound || Boolean(busy)}
          onClick={() =>
            void run('preview', async () => {
              const result = await pushInstantlyLeads(campaignId, { dryRun: true })
              setPreview(result)
              setNote(
                `${result.eligible.length} ready, ${result.skipped.length} skipped. Nothing sent.`
              )
            })
          }
          className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-neutral-800 shadow-soft disabled:opacity-50"
        >
          {busy === 'preview' ? 'Checking…' : 'Preview leads'}
        </button>
        <button
          type="button"
          disabled={disabled || !bound || Boolean(busy)}
          onClick={() =>
            void run('push', async () => {
              const result = await pushInstantlyLeads(campaignId, { dryRun: false })
              setPreview(result)
              setNote(
                result.created.length
                  ? `Pushed ${result.created.length} lead${result.created.length === 1 ? '' : 's'}. Activate stays in Instantly.`
                  : 'No new leads pushed (skipped or already there).'
              )
            })
          }
          className="rounded-xl bg-[#e85d2a] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-soft disabled:opacity-50"
        >
          {busy === 'push' ? 'Pushing…' : 'Push leads'}
        </button>
      </div>
      {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
      {note ? <p className="text-[12px] text-neutral-700">{note}</p> : null}
      {preview ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2 text-[12px] text-neutral-700">
          <p>
            Eligible {preview.eligible.length} · skipped {preview.skipped.length} · Instantly skipped{' '}
            {preview.instantlySkipped} · invalid {preview.invalidEmails} · marked {preview.marked}
          </p>
          {preview.missingVars.length ? (
            <p className="mt-1 text-amber-800">
              {preview.missingVars.length} missing first name or company (still pushed if eligible).
            </p>
          ) : null}
          {preview.skipped.length ? (
            <p className="mt-1 text-neutral-500">
              Skips:{' '}
              {Object.entries(
                preview.skipped.reduce<Record<string, number>>((acc, row) => {
                  acc[row.reason] = (acc[row.reason] || 0) + 1
                  return acc
                }, {})
              )
                .map(([reason, count]) => `${skipLabel(reason)} ${count}`)
                .join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
