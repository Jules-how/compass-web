'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { updateCampaign } from '@/lib/campaigns-client'
import { writeOutboundDesk } from '@/lib/outbound-desk'
import type { MorningNextCard, MorningSendingCard, MorningWavePayload } from '@/lib/wave-morning'
import { cn } from '@/lib/utils'

function buildLabel(status: MorningWavePayload['briefStatus']) {
  if (status === 'missing') return 'No brief on Home yet. Agent must write today’s next before land.'
  if (status === 'proposed') return 'Accept or dismiss today’s next before any live land.'
  if (status === 'dismissed') return 'Proposal thrown out. Yesterday’s next stays. Live land is open. No scrape.'
  return 'Brief accepted. List-builds may run for empty next. Live land is open.'
}

function NextRow({
  row,
  pending
}: {
  row: MorningNextCard
  pending?: boolean
}) {
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/40 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-neutral-900">{row.name}</div>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {[row.trade, row.city].filter(Boolean).join(' · ') || 'Queued'}
            {row.buildStatus !== 'none' ? ` · ${row.buildStatus}` : ''}
          </p>
        </div>
        {pending ? (
          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            Proposed
          </span>
        ) : null}
      </div>
      {row.runDetail ? <p className="mt-1 text-[11px] text-neutral-500">{row.runDetail}</p> : null}
    </div>
  )
}

function SendingRow({
  row,
  landUnlocked,
  busy,
  onConfirmCopy,
  onReviewOpeners
}: {
  row: MorningSendingCard
  landUnlocked: boolean
  busy: boolean
  onConfirmCopy: (id: string) => void
  onReviewOpeners: (id: string) => void
}) {
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/40 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-neutral-900">{row.name}</div>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {row.remaining.toLocaleString()} remaining
            {row.lowRemaining ? ' · under 50' : ''}
            {!landUnlocked ? ' · land locked' : ''}
          </p>
        </div>
        {row.instantlyHref ? (
          <a href={row.instantlyHref} target="_blank" rel="noreferrer" className="text-xs font-medium text-[#c2410c] hover:underline">
            Instantly
          </a>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {row.campaignId && row.copyBlocked ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirmCopy(row.campaignId!)}
            className="compass-btn-primary !px-3 !py-1 text-[11px]"
          >
            Confirm copy
          </button>
        ) : (
          <span className="text-[11px] text-neutral-400">Copy {row.copyConfirmed ? 'confirmed' : 'unbound'}</span>
        )}
        {row.campaignId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onReviewOpeners(row.campaignId!)}
            className="compass-btn-secondary !px-3 !py-1 text-[11px]"
          >
            {row.openerReviewed ? 'Re-tick openers' : 'Tick openers reviewed'}
          </button>
        ) : null}
        <Link
          href="/sales/outbound"
          onClick={() => writeOutboundDesk('waves')}
          className="text-[11px] font-medium text-[#c2410c] hover:underline"
        >
          Open chunk
        </Link>
      </div>
    </div>
  )
}

export function MorningWavePanel({
  wave,
  onReload
}: {
  wave: MorningWavePayload
  onReload: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function decide(action: 'accept' | 'dismiss') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/home/wave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action })
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`)
      await onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function confirmCopy(id: string) {
    setBusy(true)
    setError(null)
    try {
      await updateCampaign(id, { copy_confirmed_at: new Date().toISOString() })
      await onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function reviewOpeners(id: string) {
    setBusy(true)
    setError(null)
    try {
      await updateCampaign(id, { opener_reviewed_at: new Date().toISOString() })
      await onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="lg:col-span-2 xl:col-span-3">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-5 w-1 shrink-0 rounded-full bg-[#e85d2a]" aria-hidden />
              <h2 className="text-sm font-semibold tracking-tight text-neutral-900">Morning wave</h2>
            </div>
            <p className="mt-1 text-xs text-neutral-500">{buildLabel(wave.briefStatus)}</p>
          </div>
          <Link
            href="/sales/outbound"
            onClick={() => writeOutboundDesk('waves')}
            className="text-xs font-medium text-[#c2410c] hover:underline"
          >
            Waves
          </Link>
        </div>

        {wave.briefStatus === 'proposed' || wave.briefStatus === 'missing' ? (
          <div className="mb-3 rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2.5">
            <p className="text-sm text-amber-950">{wave.recommendation || 'Today’s next is waiting.'}</p>
            {wave.briefStatus === 'proposed' ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide('accept')}
                  className="compass-btn-primary !px-3 !py-1.5 text-[12px]"
                >
                  Accept brief
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide('dismiss')}
                  className="compass-btn-secondary !px-3 !py-1.5 text-[12px]"
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              Sending
            </h3>
            {wave.sending.length === 0 ? (
              <p className="text-sm text-neutral-500">Nothing live in Instantly.</p>
            ) : (
              <div className="space-y-2">
                {wave.sending.map((row) => (
                  <SendingRow
                    key={row.key}
                    row={row}
                    landUnlocked={wave.landUnlocked}
                    busy={busy}
                    onConfirmCopy={(id) => void confirmCopy(id)}
                    onReviewOpeners={(id) => void reviewOpeners(id)}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="space-y-4">
            {wave.proposedNext.length > 0 && wave.briefStatus === 'proposed' ? (
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                  Today’s next (accept to pin)
                </h3>
                <div className="space-y-2">
                  {wave.proposedNext.map((row) => (
                    <NextRow key={row.campaignId} row={row} pending />
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                Next
              </h3>
              {wave.activeNext.length === 0 ? (
                <p className="text-sm text-neutral-500">No queued campaigns in the two slots.</p>
              ) : (
                <div className="space-y-2">
                  {wave.activeNext.map((row) => (
                    <NextRow key={row.campaignId} row={row} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <p className={cn('mt-3 text-[11px] text-neutral-400')}>
          Land is Cursor after remaining is under 50. Activate stays Instantly. Type replies in Instantly or Gmail.
        </p>
      </CardContent>
    </Card>
  )
}
