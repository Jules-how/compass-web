'use client'

import { waveReviewLabel } from '@/lib/wave-review-label'

import Link from 'next/link'
import { OutboundRhythm } from '@/components/outbound/rhythm/OutboundRhythm'
import { useState } from 'react'
import {
  ArrowRight,
  Check,
  Clock3,
  ExternalLink,
  FilePenLine,
  Inbox,
  Plus,
  RefreshCw,
} from 'lucide-react'
import {
  FolioDialog,
  FolioFolders,
  FolioNotice,
  FolioState,
} from '@/components/folio/FolioPrimitives'
import { PathfinderHome } from '@/components/pathfinder/PathfinderHome'
import type { HomePayload } from '@/lib/home-data'
import type { MorningWavePayload } from '@/lib/wave-morning'
import type { CompassTask } from '@/lib/types'
import { useCachedJson } from '@/lib/use-cached-json'
import { INBOX_CACHE_KEY, type InboxPayload } from '@/lib/inbox-ui'
import { selectHomeWork, homeTaskNotes, homeExcerpt } from '@/lib/folio-home'
import { resolveTaskActionPlan } from '@/lib/task-action-targets'
import { workFetch } from '@/lib/workspace-change'

type Props = {
  data: HomePayload | null | undefined
  wave: MorningWavePayload | null | undefined
  tasks: CompassTask[]
  loading: boolean
  error: string | null | undefined
  taskError: string | null | undefined
  waveError: string | null | undefined
  note: string
  onCapture: () => void
  onReload: () => Promise<unknown>
}
export function FolioHome({
  data,
  wave,
  tasks,
  loading,
  error,
  taskError,
  waveError,
  note,
  onCapture,
  onReload,
}: Props) {
  const [folder, setFolder] = useState<'today' | 'waiting' | 'captured'>(
    'today',
  )
  const [briefOpen, setBriefOpen] = useState(false),
    [selected, setSelected] = useState<CompassTask | null>(null)
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState<string | null>(null),
    [success, setSuccess] = useState<string | null>(null)
  const inbox = useCachedJson<InboxPayload>(INBOX_CACHE_KEY, INBOX_CACHE_KEY)
  const work = selectHomeWork(tasks)
  const waiting = work.waiting[0],
    cold = data?.coldEmail
  const next =
    wave?.briefStatus === 'proposed'
      ? wave.proposedNext
      : (wave?.activeNext ?? [])
  const day = wave?.sydneyDate
    ? new Date(wave.sydneyDate + 'T12:00:00+10:00')
    : new Date()
  const dateLabel = day.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Australia/Sydney',
  })
  const brief = wave?.homeBlurb || wave?.recommendation || wave?.writeup
  async function decide(action: 'accept' | 'dismiss') {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      const res = await workFetch('/api/home/wave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, revision: wave?.briefRevision }),
      })
      const body = await res.json()
      if (!res.ok)
        throw new Error(body.error ?? 'The brief could not save. Try again.')
      setSuccess(
        action === 'accept'
          ? 'Brief accepted. Continue with the work below.'
          : 'Proposal dismissed. Your previous next campaigns are retained.',
      )
      setBriefOpen(false)
      await onReload()
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'The brief could not save. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function completeTask() {
    if (!selected || busy) return
    setBusy(true)
    setActionError(null)
    try {
      const res = await workFetch(
        `/api/tasks/${encodeURIComponent(selected.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        },
      )
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'The task could not save.')
      setSuccess(`Completed: ${selected.title}`)
      setSelected(null)
      await onReload()
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'The task could not save.',
      )
    } finally {
      setBusy(false)
    }
  }
  function openTask(task: CompassTask) {
    setActionError(null)
    setSelected(task)
  }
  const taskRow = (task: CompassTask) => (
    <li key={task.id} className="folio-work-row">
      <FilePenLine size={17} aria-hidden="true" />
      <div>
        <h3>{task.title}</h3>
        <p>
          {task.status === 'blocked'
            ? 'Waiting'
            : task.status === 'in-progress'
              ? 'In progress'
              : 'Ready to start'}
          {task.due
            ? ` · ${new Date(task.due).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' })}`
            : ''}
        </p>
      </div>
      <button
        className="compass-btn-secondary"
        onClick={() => openTask(task)}
        aria-label={`Review ${task.title}`}
      >
        <span>Review</span>
        <ArrowRight size={14} />
      </button>
    </li>
  )
  const plan = selected ? resolveTaskActionPlan(selected) : null
  return (
    <main className="folio-home">
      <header className="folio-page-heading">
        <div>
          <h1>A little more clarity.</h1>
          <p>{dateLabel} · Your working day</p>
        </div>
        <button
          className="compass-btn-secondary folio-capture"
          onClick={onCapture}
          aria-label={
            note.trim()
              ? 'Capture a thought, note waiting'
              : 'Capture a thought'
          }
          aria-haspopup="dialog"
        >
          <Plus size={17} />
          <span>Capture a thought</span>
        </button>
      </header>
      {error && data ? (
        <FolioNotice error>
          Home couldn’t refresh. Your last data is still here.{' '}
          <button onClick={() => void onReload()}>Try again</button>
        </FolioNotice>
      ) : null}
      <FolioFolders
        value={folder}
        onChange={setFolder}
        label="Home folders"
        items={[
          { id: 'today', label: 'Today’s brief' },
          { id: 'waiting', label: 'Waiting', count: work.waiting.length },
          { id: 'captured', label: 'Captured' },
        ]}
      />
      <div className="folio-home-layout">
        <div className="folio-home-document">
          {loading && !data ? (
            <FolioState loading title="Bringing the work into view.">
              Loading your daily brief…
            </FolioState>
          ) : error && !data ? (
            <FolioState
              title="Your brief couldn’t load."
              retry={() => void onReload()}
            >
              Your work is still available from navigation.
            </FolioState>
          ) : (
            <article className="folio-paper">
              <div className="folio-paper-meta">
                <p className="folio-caption">
                  {folder === 'today'
                    ? 'Daily brief'
                    : folder === 'waiting'
                      ? 'Waiting / blocked work'
                      : 'Captured / working notes'}
                </p>
                <span
                  className={`folio-status ${wave?.briefStatus === 'proposed' ? 'folio-status-pending' : ''}`}
                >
                  {folder === 'today'
                    ? wave?.reviewState !== 'current'
                      ? 'Review needed'
                      : wave?.briefStatus === 'proposed'
                      ? 'Review needed'
                      : wave?.briefStatus === 'accepted'
                        ? 'Accepted'
                        : wave?.briefStatus === 'dismissed'
                          ? 'Dismissed'
                          : 'No brief yet'
                    : folder === 'waiting'
                      ? `${work.waiting.length} items`
                      : note.trim()
                        ? 'Note waiting'
                        : 'Clear'}
                </span>
              </div>
              {success ? <FolioNotice>{success}</FolioNotice> : null}
              {actionError && !briefOpen && !selected ? (
                <FolioNotice error>{actionError}</FolioNotice>
              ) : null}
              {folder === 'today' ? (
                <>
                  <section className="folio-brief">
                    <p className="folio-small">{waveReviewLabel(wave)}</p>
                    <p className="folio-caption">
                      {wave?.briefStatus === 'proposed'
                        ? 'Your next decision'
                        : 'Your working brief'}
                    </p>
                    <h2>
                      {wave?.briefStatus === 'proposed' ? (
                        <>
                          A moment to decide.
                          <br />
                          Then back to the work.
                        </>
                      ) : brief ? (
                        <>
                          The next useful move.
                          <br />
                          With the context to make it.
                        </>
                      ) : (
                        <>
                          A clear place
                          <br />
                          to begin.
                        </>
                      )}
                    </h2>
                    <p>
                      {(brief ? homeExcerpt(brief) : '') ||
                        'There’s no daily brief to review yet. Choose a task or capture what needs your attention.'}
                    </p>
                    <div className="folio-actions">
                      {brief ? (
                        <button
                          className="compass-btn-primary"
                          onClick={() => {
                            setActionError(null)
                            setBriefOpen(true)
                          }}
                          aria-haspopup="dialog"
                        >
                          {wave?.briefStatus === 'proposed'
                            ? 'Review the brief'
                            : 'Read the brief'}
                          <ArrowRight size={15} />
                        </button>
                      ) : (
                        <Link className="compass-btn-primary" href="/tasks">
                          Choose a task <ArrowRight size={15} />
                        </Link>
                      )}
                      <Link
                        className="compass-btn-ghost"
                        href="/sales/outbound"
                      >
                        Open Outbound <ArrowRight size={15} />
                      </Link>
                    </div>
                  </section>
                  {waveError ? (
                    <FolioNotice error>
                      The latest brief couldn’t refresh.{' '}
                      <button onClick={() => void onReload()}>Retry</button>
                    </FolioNotice>
                  ) : null}
                  <section className="folio-home-work">
                    <div className="folio-section-heading">
                      <h3>Ready to move</h3>
                      <Link href="/tasks">
                        All tasks <ArrowRight size={13} />
                      </Link>
                    </div>
                    {taskError ? (
                      <FolioNotice error>
                        Tasks couldn’t refresh.{' '}
                        <button onClick={() => void onReload()}>Retry</button>
                      </FolioNotice>
                    ) : null}
                    <ul className="folio-work-list">
                      {work.ready.slice(0, 3).map(taskRow)}
                      {!work.ready.length ? (
                        <li className="folio-quiet">
                          <p>No open task is ready to move.</p>
                          <Link href="/tasks" className="compass-btn-ghost">
                            Review tasks <ArrowRight size={14} />
                          </Link>
                        </li>
                      ) : null}
                    </ul>
                  </section>
                  {next.length ? (
                    <section className="folio-home-work">
                      <div className="folio-section-heading">
                        <h3>
                          {wave?.briefStatus === 'proposed'
                            ? 'Proposed campaigns'
                            : 'Next campaigns'}
                        </h3>
                        <Link href="/sales/outbound">
                          Campaigns <ArrowRight size={13} />
                        </Link>
                      </div>
                      <ul className="folio-work-list">
                        {next.map((c) => (
                          <li className="folio-work-row" key={c.campaignId}>
                            <FilePenLine size={17} />
                            <div>
                              <h3>{c.name}</h3>
                              <p>
                                {[
                                  c.city,
                                  c.trade,
                                  c.buildStatus === 'none'
                                    ? 'Preparation pending'
                                    : c.buildStatus,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                            <Link
                              href={`/sales/outbound/editor/${encodeURIComponent(c.campaignId)}`}
                              className="compass-btn-secondary"
                              aria-label={`Open ${c.name}`}
                            >
                              <span>Open</span>
                              <ArrowRight size={14} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  <div className="folio-capture-strip">
                    <div>
                      <h3>Loose ends belong here.</h3>
                      <p>
                        {note.trim()
                          ? 'A note is waiting for your review.'
                          : 'Capture now. Decide what it becomes.'}
                      </p>
                    </div>
                    <button
                      className="compass-btn-secondary"
                      onClick={onCapture}
                    >
                      {note.trim() ? 'Review note' : 'Jot a note'}
                    </button>
                  </div>
                </>
              ) : folder === 'waiting' ? (
                <>
                  <h2>Give the decision room.</h2>
                  <p className="folio-intro">
                    External waits stay visible, with their reason and any
                    agreed date.
                  </p>
                  {work.waiting.length ? (
                    <ul className="folio-work-list">
                      {work.waiting.map(taskRow)}
                    </ul>
                  ) : (
                    <div className="folio-quiet">
                      <Clock3 size={24} />
                      <p>No blocked tasks in the current view.</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h2>A place for loose ends.</h2>
                  <p className="folio-intro">
                    Keep the thought, then decide what should become work.
                  </p>
                  {note.trim() ? (
                    <p className="folio-note-copy">{note}</p>
                  ) : (
                    <div className="folio-quiet">
                      <FilePenLine size={24} />
                      <p>No captured notes waiting.</p>
                    </div>
                  )}
                  <button className="compass-btn-primary" onClick={onCapture}>
                    {note.trim() ? 'Review note' : 'Capture a thought'}
                    <Plus size={15} />
                  </button>
                </>
              )}
            </article>
          )}
          <div className="folio-goal-findings">
            <OutboundRhythm compact />
      <PathfinderHome />
          </div>
        </div>
        <aside className="folio-margin" aria-label="Supporting context">
          <section className="folio-pinned">
            <div className="folio-pin" />
            <p className="folio-caption">
              {waiting ? 'Waiting for the next move' : 'Room for the next move'}
            </p>
            <h2>{waiting ? waiting.title : 'The work has a home.'}</h2>
            <p>
              {waiting
                ? homeExcerpt(homeTaskNotes(waiting.notes), 240) ||
                  'This task is blocked. Open its context to see what is needed.'
                : taskError
                  ? 'Waiting tasks could not load. Retry Home to see the current context.'
                  : 'Review open tasks, or use Planning to see the decisions connected to your goals.'}
            </p>
            {waiting ? (
              <>
                <span className="folio-wait-date">
                  <Clock3 size={13} />
                  {waiting.due
                    ? `Due ${new Date(waiting.due).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
                    : 'No due date set'}
                </span>
                <button
                  className="compass-btn-ghost"
                  onClick={() => openTask(waiting)}
                >
                  Read the context <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <Link className="compass-btn-ghost" href="/planning">
                Open Planning <ArrowRight size={14} />
              </Link>
            )}
          </section>
          <section className="folio-source">
            <div className="folio-section-heading">
              <h2>Outbound snapshot</h2>
              <button
                className="folio-icon-button"
                aria-label="Refresh Home"
                onClick={() => void onReload()}
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <dl className="folio-metrics">
              <div>
                <dt>Sent in snapshot day</dt>
                <dd>{cold?.emailsSentToday?.toLocaleString() ?? '—'}</dd>
              </div>
              <div>
                <dt>Reply rate</dt>
                <dd>{cold ? `${cold.replyRate}%` : '—'}</dd>
              </div>
            </dl>
            <p>
              {data?.coldEmailSource === 'instantly'
                ? 'Instantly'
                : 'Snapshot unavailable'}
              {data?.coldEmailSyncedAt
                ? ` · ${new Date(data.coldEmailSyncedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' })} AEST`
                : ''}
            </p>
            <Link href="/sales/outbound">
              Check current sending status <ArrowRight size={13} />
            </Link>
          </section>
          <section className="folio-source">
            <div className="folio-section-heading">
              <h2>In the Inbox</h2>
              <span>Retained items</span>
            </div>
            {inbox.error && !inbox.data ? (
              <p>Inbox counts unavailable.</p>
            ) : (
              <div className="folio-inbox-counts">
                {(['agents', 'instantly', 'leads'] as const).map((tab) => (
                  <Link key={tab} href={`/inbox?tab=${tab}`}>
                    <span>
                      {tab === 'agents'
                        ? 'Agents'
                        : tab === 'instantly'
                          ? 'Instantly'
                          : 'Leads'}
                    </span>
                    <strong>
                      {inbox.data?.channels?.[tab]?.length ?? '—'}
                    </strong>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
      <FolioDialog
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        title={wave?.briefDate && wave.briefDate !== wave.sydneyDate ? `Brief · ${wave.briefDate}` : 'Today’s brief'}
      >
        <p className="folio-small">{waveReviewLabel(wave)}</p>
        {wave?.runId ? <details className="folio-small"><summary>Review source</summary><p>{wave.publisher} · {wave.runId}</p></details> : null}
        <p className="folio-dialog-copy">
          {wave?.writeup ||
            wave?.recommendation ||
            wave?.homeBlurb ||
            'No brief is available.'}
        </p>
        {next.length ? (
          <div className="folio-note">
            <h3>
              {wave?.briefStatus === 'proposed'
                ? 'Proposed next'
                : 'Next campaigns'}
            </h3>
            <ul>
              {next.map((c) => (
                <li key={c.campaignId}>
                  <Link
                    href={`/sales/outbound/editor/${encodeURIComponent(c.campaignId)}`}
                  >
                    {c.name} <ArrowRight size={13} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {actionError ? <FolioNotice error>{actionError}</FolioNotice> : null}
        {wave?.briefStatus === 'proposed' && wave.reviewState === 'current' ? (
          <>
            <div className="folio-dialog-actions">
              <button
                className="compass-btn-primary"
                disabled={busy}
                onClick={() => void decide('accept')}
              >
                {busy ? 'Saving…' : 'Accept brief'}
              </button>
              <button
                className="compass-btn-secondary"
                disabled={busy}
                onClick={() => void decide('dismiss')}
              >
                Dismiss proposal
              </button>
            </div>
            <p className="folio-small">
              Accepting resolves today’s proposal. Campaign activation stays in
              Instantly.
            </p>
          </>
        ) : (
          <span className="folio-status">
            {wave?.reviewState === 'current' ? wave.briefStatus : 'Current review needed'}
          </span>
        )}
      </FolioDialog>
      <FolioDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? 'Task'}
      >
        <span className="folio-status">{selected?.status}</span>
        <p className="folio-small">{waveReviewLabel(wave)}</p>
        {wave?.runId ? <details className="folio-small"><summary>Review source</summary><p>{wave.publisher} · {wave.runId}</p></details> : null}
        <p className="folio-dialog-copy">
          {homeTaskNotes(selected?.notes) || 'No additional notes.'}
        </p>
        {actionError ? <FolioNotice error>{actionError}</FolioNotice> : null}
        <div className="folio-dialog-actions">
          {plan?.primary ? (
            <a
              href={plan.primary.url}
              target={plan.primary.external ? '_blank' : undefined}
              rel={plan.primary.external ? 'noopener noreferrer' : undefined}
              className="compass-btn-primary"
            >
              {plan.primary.label}
              <ExternalLink size={14} />
            </a>
          ) : null}
          <Link href="/tasks" className="compass-btn-secondary">
            Open Tasks <ArrowRight size={14} />
          </Link>
          <button
            className="compass-btn-ghost"
            disabled={busy}
            onClick={() => void completeTask()}
          >
            <Check size={15} />
            {busy ? 'Saving…' : 'Mark complete'}
          </button>
        </div>
      </FolioDialog>
    </main>
  )
}
