'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LoadingBlock } from '@/components/LoadingBlock'
import {
  formatInboxRelative,
  formatInboxWhen,
  INBOX_TAB_HINTS,
  INBOX_TAB_LABELS,
  INBOX_TABS,
  parseInboxTab,
  type InboxItem,
  type InboxPayload,
  type InboxTab
} from '@/lib/inbox-ui'
import type { InboxSuggestion, InboxTriageState, LeadLifecycleStatus } from '@/lib/inbox-triage'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

const EMPTY_COPY: Record<InboxTab, { title: string; body: string }> = {
  agents: {
    title: 'No agent notifications',
    body: 'Blocked agent work and recent completions that still need review show up here.'
  },
  instantly: {
    title: 'No Instantly replies',
    body: 'Replies and positive Instantly interest will appear here as they come in.'
  },
  leads: {
    title: 'No open inbound leads',
    body: 'Website, guide, and Meta leads stay here until Contacted, Qualified, or Discarded.'
  }
}

function InboxEmptyIllustration() {
  return (
    <svg
      width="64"
      height="52"
      viewBox="0 0 64 52"
      fill="none"
      aria-hidden="true"
      className="text-neutral-300"
    >
      <path
        d="M8 18h48v26a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V18Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M8 18 32 34 56 18" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 8h36l6 10H8l6-10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function SourceGlyph({ tab }: { tab: InboxTab }) {
  const label = tab === 'agents' ? 'A' : tab === 'instantly' ? 'I' : 'L'
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
        tab === 'agents' && 'bg-amber-100 text-amber-800',
        tab === 'instantly' && 'bg-emerald-100 text-emerald-800',
        tab === 'leads' && 'bg-neutral-200 text-neutral-700'
      )}
    >
      {label}
    </span>
  )
}

function NotificationRow({
  item,
  selected,
  onSelect
}: {
  item: InboxItem
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full gap-3 border-b border-neutral-100 px-3 py-3 text-left transition',
        selected ? 'bg-sky-50/80' : 'hover:bg-neutral-50',
        !item.unread && 'opacity-75'
      )}
    >
      <SourceGlyph tab={item.tab} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-neutral-900">{item.title}</div>
            <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-neutral-500">
              {item.preview}
            </div>
            {item.related.length > 0 ? (
              <div className="mt-1 text-[11px] text-neutral-400">
                Also in {item.related.map((r) => INBOX_TAB_LABELS[r.tab]).join(', ')}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
            <span className="text-[11px] tabular-nums text-neutral-400">
              {formatInboxRelative(item.occurredAt)}
            </span>
            {item.unread ? (
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-label="Unread" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full border border-neutral-300" aria-hidden />
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

function ActionButton({
  children,
  onClick,
  tone = 'neutral',
  disabled
}: {
  children: ReactNode
  onClick: () => void
  tone?: 'neutral' | 'primary' | 'danger'
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition disabled:opacity-50',
        tone === 'primary' && 'border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800',
        tone === 'danger' && 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
        tone === 'neutral' && 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
      )}
    >
      {children}
    </button>
  )
}

function ContextPane({
  item,
  busy,
  suggestion,
  onTriage,
  onLifecycle,
  onCreateTask,
  onRefreshSuggest
}: {
  item: InboxItem | null
  busy: boolean
  suggestion: InboxSuggestion | null
  onTriage: (triage: InboxTriageState) => void
  onLifecycle: (lifecycle: LeadLifecycleStatus) => void
  onCreateTask: () => void
  onRefreshSuggest: () => void
}) {
  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <InboxEmptyIllustration />
        <div>
          <p className="text-sm font-medium text-neutral-700">Select a notification</p>
          <p className="mt-1 max-w-sm text-sm text-neutral-500">
            Context, triage actions, and a suggested next step show here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200/80 px-5 py-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] text-neutral-500">
            {INBOX_TAB_LABELS[item.tab]}
            {item.sourceLabel ? ` · ${item.sourceLabel}` : ''}
          </div>
          <h2 className="mt-0.5 truncate text-[15px] font-semibold tracking-tight text-neutral-900">
            {item.title}
          </h2>
        </div>
        {item.href ? (
          <Link
            href={item.href}
            className="shrink-0 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Open
          </Link>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <h3 className="text-2xl font-semibold tracking-tight text-neutral-900">{item.title}</h3>
        <p className="mt-1 text-sm text-neutral-500">{formatInboxWhen(item.occurredAt)}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {item.unread ? (
            <ActionButton disabled={busy} onClick={() => onTriage('read')}>
              Mark read
            </ActionButton>
          ) : (
            <ActionButton disabled={busy} onClick={() => onTriage('unread')}>
              Mark unread
            </ActionButton>
          )}
          <ActionButton disabled={busy} onClick={() => onTriage('snoozed')}>
            Snooze 24h
          </ActionButton>
          <ActionButton disabled={busy} tone="primary" onClick={() => onTriage('done')}>
            Done
          </ActionButton>
          {(item.tab === 'leads' || item.email) && (
            <ActionButton disabled={busy} onClick={onCreateTask}>
              Create task
            </ActionButton>
          )}
        </div>

        {item.tab === 'leads' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton disabled={busy} onClick={() => onLifecycle('contacted')}>
              Contacted
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => onLifecycle('qualified')}>
              Qualified
            </ActionButton>
            <ActionButton disabled={busy} tone="danger" onClick={() => onLifecycle('discarded')}>
              Discard
            </ActionButton>
          </div>
        ) : null}

        {suggestion ? (
          <div className="mt-5 rounded-lg border border-neutral-200/80 bg-neutral-50/70 px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                Suggested next step
                {suggestion.source === 'ai' ? ' · AI' : ''}
              </h4>
              <button
                type="button"
                className="text-[11px] text-neutral-500 underline-offset-2 hover:underline"
                onClick={onRefreshSuggest}
              >
                Refresh
              </button>
            </div>
            <p className="mt-1 text-sm font-medium text-neutral-900">{suggestion.nextStep}</p>
            <p className="mt-1 text-[12px] text-neutral-500">{suggestion.rationale}</p>
          </div>
        ) : null}

        {item.related.length > 0 ? (
          <div className="mt-5">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
              Same person
            </h4>
            <ul className="mt-2 space-y-1">
              {item.related.map((rel) => (
                <li key={rel.itemId} className="text-sm text-neutral-700">
                  <Link
                    href={`/inbox?tab=${rel.tab}&id=${encodeURIComponent(rel.itemId)}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {INBOX_TAB_LABELS[rel.tab]} · {rel.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {(item.contactName || item.email || item.phone) && (
            <div className="rounded-lg border border-neutral-200/80 bg-neutral-50/60 px-3 py-2.5 sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                Contact
              </dt>
              <dd className="mt-1 text-sm text-neutral-800">
                {item.contactName ? <div className="font-medium">{item.contactName}</div> : null}
                {item.email ? <div className="text-neutral-600">{item.email}</div> : null}
                {item.phone ? <div className="text-neutral-500">{item.phone}</div> : null}
              </dd>
            </div>
          )}
          {item.meta.map((row) => (
            <div key={`${row.label}-${row.value}`} className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                {row.label}
              </dt>
              <dd className="mt-1 truncate text-sm text-neutral-800">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
            Context
          </h4>
          <div className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-800">
            {item.body?.trim() || item.preview || 'No additional context.'}
          </div>
        </div>
      </div>
    </div>
  )
}

export function InboxPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = parseInboxTab(searchParams.get('tab'))
  const selectedParam = searchParams.get('id')
  const [mobileShowContext, setMobileShowContext] = useState(false)
  const [suggestion, setSuggestion] = useState<InboxSuggestion | null>(null)
  const [busy, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  const url = `/api/inbox?tab=${tab}`
  const { data, error, loading, reload } = useCachedJson<InboxPayload>(url, url)

  const items = data?.items ?? []
  const counts = data?.counts
  const needsYou = data?.needsYou ?? []

  const selectedId = useMemo(() => {
    if (selectedParam && items.some((item) => item.id === selectedParam)) return selectedParam
    return items[0]?.id ?? null
  }, [items, selectedParam])

  const selected = items.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    if (selectedParam || !items[0]?.id) return
    const params = new URLSearchParams()
    params.set('tab', tab)
    params.set('id', items[0].id)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [items, pathname, router, selectedParam, tab])

  const loadSuggestion = useCallback(async (item: InboxItem) => {
    setSuggestion(null)
    try {
      const res = await fetch('/api/inbox/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          tab: item.tab,
          title: item.title,
          preview: item.preview,
          body: item.body,
          email: item.email,
          phone: item.phone,
          agentStatus: item.agentStatus,
          instantlyStatus: item.instantlyStatus,
          lifecycle: item.lifecycle,
          sourceLabel: item.sourceLabel
        })
      })
      if (!res.ok) return
      const json = (await res.json()) as InboxSuggestion
      setSuggestion(json)
    } catch {
      // Heuristic endpoint should rarely fail; ignore soft errors.
    }
  }, [])

  useEffect(() => {
    if (!selected) {
      setSuggestion(null)
      return
    }
    void loadSuggestion(selected)
  }, [selected, loadSuggestion])

  function setTab(next: InboxTab) {
    const params = new URLSearchParams()
    params.set('tab', next)
    setMobileShowContext(false)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function selectItem(item: InboxItem) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', item.tab)
    params.set('id', item.id)
    setMobileShowContext(true)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    if (item.unread) {
      void patchTriage(item, 'read', { silent: true })
    }
  }

  async function patchTriage(
    item: InboxItem,
    triage: InboxTriageState,
    opts?: { lifecycle?: LeadLifecycleStatus; silent?: boolean }
  ) {
    setActionError(null)
    const res = await fetch('/api/inbox/triage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        channel: item.tab,
        sourceId: item.sourceId,
        triage,
        email: item.email,
        phone: item.phone,
        identityKey: item.identityKey,
        lifecycle: opts?.lifecycle
      })
    })
    if (!res.ok) {
      if (!opts?.silent) setActionError('Could not update triage')
      return false
    }
    await reload(true)
    return true
  }

  function onTriage(triage: InboxTriageState) {
    if (!selected) return
    startTransition(() => {
      void patchTriage(selected, triage)
    })
  }

  function onLifecycle(lifecycle: LeadLifecycleStatus) {
    if (!selected) return
    const triage: InboxTriageState =
      lifecycle === 'discarded' ? 'done' : selected.unread ? 'read' : selected.triage
    startTransition(() => {
      void patchTriage(selected, triage, { lifecycle })
    })
  }

  function onCreateTask() {
    if (!selected) return
    startTransition(() => {
      void (async () => {
        setActionError(null)
        const title =
          selected.tab === 'leads'
            ? `Follow up: ${selected.title}`
            : selected.tab === 'instantly'
              ? `Reply: ${selected.title}`
              : selected.title
        const notes = [
          selected.email ? `Email: ${selected.email}` : null,
          selected.phone ? `Phone: ${selected.phone}` : null,
          selected.body || selected.preview,
          `From Inbox (${selected.tab})`
        ]
          .filter(Boolean)
          .join('\n')
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            title,
            notes,
            priority: selected.tab === 'instantly' ? 2 : 3,
            source: 'inbox'
          })
        })
        if (!res.ok) {
          setActionError('Could not create task')
          return
        }
        await patchTriage(selected, 'read')
        router.push('/tasks')
      })()
    })
  }

  if (error && !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}{' '}
          <button type="button" className="underline" onClick={() => void reload(true)}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <LoadingBlock label="Loading inbox…" />
      </div>
    )
  }

  const empty = EMPTY_COPY[tab]

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white text-neutral-900">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-neutral-200/80 px-4">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight">Inbox</h1>
          <p className="truncate text-[12px] text-neutral-500">{INBOX_TAB_HINTS[tab]}</p>
        </div>
        <div className="text-[12px] tabular-nums text-neutral-400">
          {data.badgeTotal} need{data.badgeTotal === 1 ? 's' : ''} you · {data.total} shown
        </div>
      </header>

      {needsYou.length > 0 ? (
        <div className="shrink-0 border-b border-neutral-200/80 bg-neutral-50/50 px-3 py-2">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
            Needs you
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {needsYou.map((item) => (
              <button
                key={`needs-${item.id}`}
                type="button"
                onClick={() => {
                  const params = new URLSearchParams()
                  params.set('tab', item.tab)
                  params.set('id', item.id)
                  setMobileShowContext(true)
                  router.replace(`${pathname}?${params.toString()}`, { scroll: false })
                }}
                className={cn(
                  'inline-flex max-w-[220px] shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition',
                  item.id === selectedId
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300'
                )}
              >
                <SourceGlyph tab={item.tab} />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium">{item.title}</span>
                  <span
                    className={cn(
                      'block truncate text-[11px]',
                      item.id === selectedId ? 'text-white/70' : 'text-neutral-500'
                    )}
                  >
                    {INBOX_TAB_LABELS[item.tab]} · {formatInboxRelative(item.occurredAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-200/80 px-2 py-1.5">
        {INBOX_TABS.map((key) => {
          const count = counts?.[key] ?? 0
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition',
                active
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'
              )}
            >
              {INBOX_TAB_LABELS[key]}
              <span
                className={cn(
                  'rounded px-1 text-[11px] tabular-nums',
                  active ? 'bg-white/15 text-white' : 'bg-neutral-100 text-neutral-500'
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {actionError ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-800">
          {actionError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <section
          className={cn(
            'flex min-h-0 w-full shrink-0 flex-col border-neutral-200/80 md:w-[340px] md:border-r lg:w-[380px]',
            mobileShowContext ? 'hidden md:flex' : 'flex'
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <InboxEmptyIllustration />
                <div>
                  <p className="text-sm font-medium text-neutral-700">{empty.title}</p>
                  <p className="mt-1 max-w-xs text-sm text-neutral-500">{empty.body}</p>
                </div>
              </div>
            ) : (
              items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onSelect={() => selectItem(item)}
                />
              ))
            )}
          </div>
        </section>

        <section
          className={cn(
            'min-h-0 min-w-0 flex-1 bg-white',
            mobileShowContext ? 'flex' : 'hidden md:flex'
          )}
        >
          <div className="flex min-h-0 w-full flex-col">
            {mobileShowContext ? (
              <button
                type="button"
                className="border-b border-neutral-200 px-4 py-2 text-left text-[13px] text-neutral-600 md:hidden"
                onClick={() => setMobileShowContext(false)}
              >
                ← Back to inbox
              </button>
            ) : null}
            <ContextPane
              item={items.length === 0 ? null : selected}
              busy={busy}
              suggestion={suggestion}
              onTriage={onTriage}
              onLifecycle={onLifecycle}
              onCreateTask={onCreateTask}
              onRefreshSuggest={() => {
                if (selected) void loadSuggestion(selected)
              }}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
