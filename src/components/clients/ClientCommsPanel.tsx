'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  COMM_CHANNELS,
  COMM_DIRECTIONS,
  commChannelLabel
} from '@/lib/client-comms'
import { formatRelativeTouch } from '@/lib/client-pm'
import type {
  CommChannel,
  CommDirection,
  CompassClientCommThreadWithMessages
} from '@/lib/types'

interface CommsPayload {
  clientId: string
  clientName: string
  summary: string | null
  summaryAt: string | null
  summarySource: string | null
  threads: CompassClientCommThreadWithMessages[]
}

interface ClientCommsPanelProps {
  clientId: string
  /** Seed from client detail payload so Overview can show context immediately. */
  initialSummary?: string | null
  initialSummaryAt?: string | null
  saving: boolean
  onBusy: (busy: boolean) => void
  onError: (message: string | null) => void
  onClientRefresh?: () => Promise<void>
}

export function ClientCommsPanel({
  clientId,
  initialSummary = null,
  initialSummaryAt = null,
  saving,
  onBusy,
  onError,
  onClientRefresh
}: ClientCommsPanelProps) {
  const [data, setData] = useState<CommsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [channel, setChannel] = useState<CommChannel>('email')
  const [subject, setSubject] = useState('')
  const [participants, setParticipants] = useState('')
  const [externalId, setExternalId] = useState('')
  const [notes, setNotes] = useState('')

  const [messageBody, setMessageBody] = useState('')
  const [messageDirection, setMessageDirection] = useState<CommDirection>('inbound')
  const [messageSender, setMessageSender] = useState('')

  const load = useCallback(async () => {
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/comms`, {
        headers: { Accept: 'application/json' }
      })
      if (!res.ok) throw new Error(`Failed to load communications (${res.status})`)
      const body = (await res.json()) as CommsPayload
      setData(body)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [clientId, onError])

  useEffect(() => {
    void load()
  }, [load])

  // Near-real-time: poll while this tab is mounted so ingest from a few minutes ago shows up.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void load()
    }, 45_000)
    const onFocus = () => {
      void load()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  async function linkThread(event: FormEvent) {
    event.preventDefault()
    if (!subject.trim()) return
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/comms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          subject: subject.trim(),
          participants,
          external_id: externalId.trim() || null,
          notes: notes.trim() || null
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Link failed (${res.status})`)
      }
      setSubject('')
      setParticipants('')
      setExternalId('')
      setNotes('')
      await load()
      await onClientRefresh?.()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  async function unlinkThread(threadId: string) {
    if (!window.confirm('Unlink this thread? Messages stored for it will be removed.')) return
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/comms/${threadId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Unlink failed (${res.status})`)
      }
      if (expandedId === threadId) setExpandedId(null)
      await load()
      await onClientRefresh?.()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  async function addMessage(threadId: string) {
    if (!messageBody.trim()) return
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/comms/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: messageBody.trim(),
          direction: messageDirection,
          sender: messageSender.trim() || null,
          refresh_summary: true
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Add message failed (${res.status})`)
      }
      setMessageBody('')
      setMessageSender('')
      await load()
      await onClientRefresh?.()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  async function refreshSummary() {
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/comms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize' })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Summarize failed (${res.status})`)
      }
      await load()
      await onClientRefresh?.()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  const summary = data?.summary ?? initialSummary
  const summaryAt = data?.summaryAt ?? initialSummaryAt
  const threads = data?.threads ?? []

  if (loading && !data) {
    return <p className="text-sm text-neutral-500">Loading communications…</p>
  }

  return (
    <div className="space-y-5">
      <section className="compass-panel space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-neutral-900">Recent context</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Auto-gathered from linked threads
              {summaryAt ? ` · updated ${formatRelativeTouch(summaryAt)}` : ''}
              {data?.summarySource ? ` · ${data.summarySource}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshSummary()}
            disabled={saving}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Refresh summary
          </button>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
          {summary?.trim() ||
            'No context yet. Link an email or SMS thread below — new messages will update this summary automatically.'}
        </p>
      </section>

      <section className="compass-panel space-y-4 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-neutral-900">Link a thread</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Connect email, SMS, or call threads manually. Set an external id (e.g. Gmail thread id) so
            automation can push new messages via{' '}
            <code className="rounded bg-neutral-100 px-1 py-0.5 text-[11px]">POST /api/ingest/comms</code>.
          </p>
        </div>
        <form onSubmit={linkThread} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Channel</span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as CommChannel)}
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5"
              disabled={saving}
            >
              {COMM_CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {commChannelLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block text-xs text-neutral-500">External id (optional)</span>
            <input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="gmail-thread-… / sms-thread-…"
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5"
              disabled={saving}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">Subject / label</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Re: Q2 retainer · or SMS with Ezechiel"
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5"
              disabled={saving}
              required
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">Participants</span>
            <input
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="name@client.com, +61…"
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5"
              disabled={saving}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">Notes</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this thread matters"
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5"
              disabled={saving}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving || !subject.trim()}
              className="rounded-lg bg-[var(--compass-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Link thread
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-neutral-900">
          Linked threads ({threads.length})
        </h2>
        {threads.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white/70 px-4 py-8 text-center text-sm text-neutral-500">
            No threads linked yet.
          </p>
        ) : (
          threads.map((thread) => {
            const open = expandedId === thread.id
            return (
              <article key={thread.id} className="compass-panel overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : thread.id)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-50/80"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-600">
                        {commChannelLabel(thread.channel)}
                      </span>
                      {thread.status === 'archived' ? (
                        <span className="text-[11px] text-neutral-400">Archived</span>
                      ) : null}
                      <span className="truncate text-sm font-semibold text-neutral-900">
                        {thread.subject}
                      </span>
                    </div>
                    <p className="truncate text-xs text-neutral-500">
                      {(thread.participants ?? []).join(', ') || 'No participants'}
                      {' · '}
                      {thread.last_message_at
                        ? formatRelativeTouch(thread.last_message_at)
                        : 'No messages yet'}
                      {thread.external_id ? ` · id ${thread.external_id}` : ''}
                    </p>
                    {thread.summary ? (
                      <p className="line-clamp-2 text-xs text-neutral-600">{thread.summary}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-neutral-400">{open ? 'Hide' : 'Open'}</span>
                </button>

                {open ? (
                  <div className="space-y-4 border-t border-stone-200 px-4 py-4">
                    <div className="space-y-2">
                      {(thread.messages ?? []).length === 0 ? (
                        <p className="text-sm text-neutral-500">No messages yet — paste one or wait for ingest.</p>
                      ) : (
                        (thread.messages ?? []).map((message) => (
                          <div
                            key={message.id}
                            className={`rounded-lg border px-3 py-2 text-sm ${
                              message.direction === 'outbound'
                                ? 'border-orange-100 bg-orange-50/60'
                                : 'border-stone-200 bg-stone-50/80'
                            }`}
                          >
                            <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                              <span className="font-medium uppercase tracking-wide">
                                {message.direction}
                              </span>
                              <span>{message.sender || '—'}</span>
                              <span>{formatRelativeTouch(message.occurred_at)}</span>
                            </div>
                            <p className="whitespace-pre-wrap text-neutral-800">{message.body}</p>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
                      <select
                        value={messageDirection}
                        onChange={(e) => setMessageDirection(e.target.value as CommDirection)}
                        className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                        disabled={saving}
                      >
                        {COMM_DIRECTIONS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <input
                        value={messageSender}
                        onChange={(e) => setMessageSender(e.target.value)}
                        placeholder="Sender (optional)"
                        className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                        disabled={saving}
                      />
                      <textarea
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                        placeholder="Paste a message or note from this thread…"
                        rows={3}
                        className="sm:col-span-2 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                        disabled={saving}
                      />
                      <div className="sm:col-span-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void addMessage(thread.id)}
                          disabled={saving || !messageBody.trim()}
                          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          Add message
                        </button>
                        <button
                          type="button"
                          onClick={() => void unlinkThread(thread.id)}
                          disabled={saving}
                          className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Unlink thread
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
