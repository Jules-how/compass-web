'use client'

import { waveReviewLabel } from '@/lib/wave-review-label'

import { workFetch } from '@/lib/workspace-change'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { HomePrioritySheet } from '@/components/home/HomePriorityActions'
import { updateCampaign } from '@/lib/campaigns-client'
import {
  cardBriefLine,
  readHomeSeenIds,
  writeHomeSeenIds,
  type HomeGlance,
  type HomeLeverageTask
} from '@/lib/home-setup'
import { writeOutboundDesk } from '@/lib/outbound-desk'
import type { CompassTask, TaskStatus, TaskType } from '@/lib/types'
import type { MorningNextCard, MorningSendingCard, MorningWavePayload } from '@/lib/wave-morning'
import { cn } from '@/lib/utils'

const easeOut = [0.22, 1, 0.36, 1] as const

function buildLabel(status: MorningWavePayload['briefStatus']) {
  if (status === 'missing') return 'No brief on Home yet. Agent must write today’s next before land.'
  if (status === 'proposed') return 'Accept or dismiss today’s next before any live land.'
  if (status === 'dismissed') return 'Proposal thrown out. Yesterday’s next stays. Live land is open. No scrape.'
  return 'Brief accepted. List-builds may run for empty next. Live land is open.'
}

function toCompassTask(row: HomeLeverageTask): CompassTask {
  return {
    id: row.id,
    title: row.title,
    status: (row.status as TaskStatus) || 'not-started',
    priority: row.priority ?? 0,
    due: row.due,
    source: row.source,
    project_id: row.project_id,
    parent_task_id: null,
    business_function_id: null,
    task_type: (row.task_type as TaskType | null) ?? null,
    complexity: null,
    notes: row.notes,
    execution_level: 0,
    execution_mode: null,
    execution_contract: null,
    contract_revision: 0,
    created_at: row.created_at,
    updated_at: row.created_at,
    mirrored_at: row.created_at
  }
}

function NextStrip({ rows, pending }: { rows: MorningNextCard[]; pending?: boolean }) {
  if (rows.length === 0) return null
  return (
    <p className="mt-2 text-[11px] text-neutral-500">
      {pending ? 'Proposed next: ' : 'Pinned next: '}
      {rows.map((row) => row.name).join(' · ')}
    </p>
  )
}

function SendingRow({
  row,
  landUnlocked,
  busy,
  onConfirmCopy,
  onReviewOpeners,
  onOpenChunk
}: {
  row: MorningSendingCard
  landUnlocked: boolean
  busy: boolean
  onConfirmCopy: (id: string) => void
  onReviewOpeners: (id: string) => void
  onOpenChunk: (row: MorningSendingCard) => void
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
          <a
            href={row.instantlyHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-[#c2410c] hover:underline"
          >
            Instantly
            <span className="sr-only"> (opens in a new tab)</span>
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
        <button
          type="button"
          onClick={() => onOpenChunk(row)}
          className="text-[11px] font-medium text-[#c2410c] hover:underline"
        >
          Open chunk
        </button>
      </div>
    </div>
  )
}

function BriefDialog({
  wave,
  glance,
  onClose,
  onAccept,
  onDismiss,
  busy
}: {
  wave: MorningWavePayload
  glance: HomeGlance | null
  onClose: () => void
  onAccept: () => void
  onDismiss: () => void
  busy: boolean
}) {
  const writeup = (wave.writeup || wave.recommendation || '').trim()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-10 sm:py-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <button type="button" className="absolute inset-0 bg-neutral-950/35" aria-label="Close brief" onClick={onClose} />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-brief-title"
          className="relative z-10 w-full max-w-lg rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.22, ease: easeOut }}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">Morning brief</p>
              <h2 id="home-brief-title" className="mt-0.5 text-lg font-semibold tracking-tight text-neutral-900">
                {cardBriefLine(wave.homeBlurb, wave.recommendation)}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="compass-btn-ghost">
              Close
            </button>
          </div>

          {glance ? (
            <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl border border-stone-100 bg-stone-50/50 px-3 py-2.5">
              <GlanceStat label="Sent today" value={glance.emailsSentToday?.toLocaleString() ?? '—'} />
              <GlanceStat label="Reply rate" value={glance.replyRate != null ? `${glance.replyRate}%` : '—'} />
              <GlanceStat label="Replies waiting" value={glance.repliesWaiting?.toLocaleString() ?? '—'} />
            </div>
          ) : null}

          <p className="mb-3 text-sm text-neutral-600">{waveReviewLabel(wave)}</p>
          <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
            {writeup || 'No writeup from this morning’s run yet.'}
          </div>

          {wave.briefStatus === 'proposed' && wave.reviewState === 'current' ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
              <button type="button" disabled={busy} onClick={onAccept} className="compass-btn-primary">
                Accept brief
              </button>
              <button type="button" disabled={busy} onClick={onDismiss} className="compass-btn-secondary">
                Dismiss
              </button>
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function GlanceStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-neutral-900">{value}</div>
    </div>
  )
}

function ChunkDialog({
  row,
  landUnlocked,
  busy,
  onClose,
  onConfirmCopy,
  onReviewOpeners
}: {
  row: MorningSendingCard
  landUnlocked: boolean
  busy: boolean
  onClose: () => void
  onConfirmCopy: (id: string) => void
  onReviewOpeners: (id: string) => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-10 sm:py-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <button type="button" className="absolute inset-0 bg-neutral-950/35" aria-label="Close chunk" onClick={onClose} />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-chunk-title"
          className="relative z-10 w-full max-w-lg rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.22, ease: easeOut }}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">Sending chunk</p>
              <h2 id="home-chunk-title" className="mt-0.5 text-lg font-semibold tracking-tight text-neutral-900">
                {row.name}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="compass-btn-ghost">
              Close
            </button>
          </div>

          <dl className="space-y-2 rounded-xl border border-stone-100 bg-stone-50/50 px-3.5 py-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">Remaining</dt>
              <dd className="font-medium tabular-nums text-neutral-900">
                {row.remaining.toLocaleString()}
                {row.lowRemaining ? ' · under 50' : ''}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">Copy</dt>
              <dd className="font-medium text-neutral-900">
                {row.copyBlocked ? 'Needs confirm' : row.copyConfirmed ? 'Confirmed' : 'Unbound'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">Openers</dt>
              <dd className="font-medium text-neutral-900">{row.openerReviewed ? 'Reviewed' : 'Not reviewed'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">Land</dt>
              <dd className="font-medium text-neutral-900">{landUnlocked ? 'Open' : 'Locked until brief is accepted or dismissed'}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {row.campaignId && row.copyBlocked ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onConfirmCopy(row.campaignId!)}
                className="compass-btn-primary"
              >
                Confirm copy
              </button>
            ) : null}
            {row.campaignId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onReviewOpeners(row.campaignId!)}
                className="compass-btn-secondary"
              >
                {row.openerReviewed ? 'Re-tick openers' : 'Tick openers reviewed'}
              </button>
            ) : null}
            {row.instantlyHref ? (
              <a
                href={row.instantlyHref}
                target="_blank"
                rel="noopener noreferrer"
                className="compass-btn-secondary"
              >
                Open Instantly
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export function MorningWavePanel({
  wave,
  glance,
  onReload
}: {
  wave: MorningWavePayload
  glance?: HomeGlance | null
  onReload: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [briefOpen, setBriefOpen] = useState(false)
  const [chunk, setChunk] = useState<MorningSendingCard | null>(null)
  const [openTask, setOpenTask] = useState<CompassTask | null>(null)
  const [seenIds, setSeenIds] = useState<string[]>([])
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    setSeenIds(readHomeSeenIds(wave.sydneyDate))
  }, [wave.sydneyDate])

  useEffect(() => {
    setChunk((current) => {
      if (!current) return current
      const next = wave.sending.find((row) => row.key === current.key)
      return next ?? null
    })
  }, [wave.sending])

  const leverage = useMemo(
    () => (wave.leverage ?? []).filter((row) => !seenIds.includes(row.id)),
    [wave.leverage, seenIds]
  )

  const cardLine = cardBriefLine(wave.homeBlurb, wave.recommendation)
  const nextRows =
    wave.briefStatus === 'proposed' && wave.proposedNext.length > 0 ? wave.proposedNext : wave.activeNext

  async function decide(action: 'accept' | 'dismiss') {
    setBusy(true)
    setError(null)
    try {
      const res = await workFetch('/api/home/wave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action, revision: wave?.briefRevision })
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`)
      setBriefOpen(false)
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

  function viewLeverage(row: HomeLeverageTask) {
    const next = [...seenIds, row.id]
    setSeenIds(next)
    writeHomeSeenIds(wave.sydneyDate, next)
    setOpenTask(toCompassTask(row))
  }

  async function completeOpenTask(task: CompassTask) {
    if (completing || task.status === 'completed' || task.status === 'cancelled') return
    setCompleting(true)
    try {
      const res = await workFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ status: 'completed' })
      })
      if (!res.ok) return
      setOpenTask(null)
      await onReload()
    } finally {
      setCompleting(false)
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
            <button
              type="button"
              onClick={() => setBriefOpen(true)}
              className="w-full text-left text-sm text-amber-950 hover:underline"
            >
              {cardLine}
              <span className="block text-xs">{waveReviewLabel(wave)}</span>
            </button>
            {wave.briefStatus === 'proposed' && wave.reviewState === 'current' ? (
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
            <NextStrip
              rows={nextRows}
              pending={wave.briefStatus === 'proposed' && wave.proposedNext.length > 0}
            />
          </div>
        ) : (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setBriefOpen(true)}
              className="text-left text-sm font-medium text-neutral-800 hover:underline"
            >
              {cardLine}
              <span className="block text-xs">{waveReviewLabel(wave)}</span>
            </button>
            <NextStrip rows={wave.activeNext} />
          </div>
        )}

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
                    onOpenChunk={setChunk}
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              Highest leverage
            </h3>
            {leverage.length === 0 ? (
              <p className="text-sm text-neutral-500">No Jules-led items from this morning’s run.</p>
            ) : (
              <div className="space-y-2">
                {leverage.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => viewLeverage(row)}
                    className="w-full rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 text-left transition hover:border-amber-300"
                  >
                    <div className="text-sm font-medium text-neutral-900">{row.title}</div>
                    {row.notes ? (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-neutral-500">
                        {row.notes.replace(/^daily_setup:[^\n]+\n*/, '').trim() || 'Open to read the brief'}
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className={cn('mt-3 text-[11px] text-neutral-400')}>
          Land is Cursor after remaining is under 50. Activate stays Instantly. Type replies in Instantly or Gmail.
        </p>
      </CardContent>

      {briefOpen ? (
        <BriefDialog
          wave={wave}
          glance={glance ?? null}
          busy={busy}
          onClose={() => setBriefOpen(false)}
          onAccept={() => void decide('accept')}
          onDismiss={() => void decide('dismiss')}
        />
      ) : null}
      {chunk ? (
        <ChunkDialog
          row={chunk}
          landUnlocked={wave.landUnlocked}
          busy={busy}
          onClose={() => setChunk(null)}
          onConfirmCopy={(id) => void confirmCopy(id)}
          onReviewOpeners={(id) => void reviewOpeners(id)}
        />
      ) : null}
      {openTask ? (
        <HomePrioritySheet
          task={openTask}
          project={null}
          completing={completing}
          onClose={() => setOpenTask(null)}
          onComplete={(task) => void completeOpenTask(task)}
        />
      ) : null}
    </Card>
  )
}
