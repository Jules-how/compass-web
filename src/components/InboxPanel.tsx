'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useConsoleViewPath } from '@/components/ConsoleNav'
import { LoadingBlock } from '@/components/LoadingBlock'
import {
  countActionableBadge,
  formatInboxRelative,
  formatInboxWhen,
  INBOX_CACHE_KEY,
  INBOX_TAB_HINTS,
  INBOX_TAB_LABELS,
  INBOX_TABS,
  itemsForInboxTab,
  parseInboxTab,
  pickNeedsYou,
  type InboxItem,
  type InboxPayload,
  type InboxTab
} from '@/lib/inbox-ui'
import type { InboxSuggestion, InboxTriageState, LeadLifecycleStatus } from '@/lib/inbox-triage'
import { INSTANTLY_CLASSIFY_ACTIONS, classifyAction } from '@/lib/inbox-classify'
import { peekQueryCache, writeQueryCache } from '@/lib/query-cache'
import { tasksHref } from '@/lib/task-organisation'
import { useCachedJson } from '@/lib/use-cached-json'
import { useUndo } from '@/components/UndoProvider'
import { cn } from '@/lib/utils'

function replaceInboxUrl(params: URLSearchParams) {
  const url = `/inbox?${params.toString()}`
  // Fresh state lets Next update useSearchParams without a server round-trip.
  window.history.replaceState(null, '', url)
}

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
      aria-hidden
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

function relatedTabLabels(item: InboxItem) {
  return [...new Set(item.related.map((r) => INBOX_TAB_LABELS[r.tab]))]
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
  const alsoIn = relatedTabLabels(item)
  return (
    <button
      type="button"
      id={`inbox-row-${item.id}`}
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full gap-3 border-b border-stone-100 px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#e85d2a]/40',
        selected ? 'bg-[#e85d2a]/[0.06]' : 'hover:bg-stone-50/80',
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
            {alsoIn.length > 0 ? (
              <div className="mt-1 text-[11px] text-neutral-400">Also in {alsoIn.join(', ')}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
            <span className="text-[11px] tabular-nums text-neutral-400">
              {formatInboxRelative(item.occurredAt)}
            </span>
            {item.unread ? (
              <>
                <span className="sr-only">Unread</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#e85d2a]" aria-hidden />
              </>
            ) : (
              <span className="h-1.5 w-1.5 rounded-full border border-stone-300" aria-hidden />
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
        'rounded-xl border px-2.5 py-1.5 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d2a]/40 disabled:opacity-50',
        tone === 'primary' &&
          'border-transparent bg-[var(--compass-accent)] text-white hover:bg-[var(--compass-accent-hover)]',
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
  onRefreshSuggest,
  onClassify
}: {
  item: InboxItem | null
  busy: boolean
  suggestion: InboxSuggestion | null
  onTriage: (triage: InboxTriageState) => void
  onLifecycle: (lifecycle: LeadLifecycleStatus) => void
  onCreateTask: () => void
  onRefreshSuggest: () => void
  onClassify: (id: string) => void
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
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
        <div className="min-w-0">
          <div className="truncate text-[13px] text-neutral-500">
            {INBOX_TAB_LABELS[item.tab]}
            {item.sourceLabel ? ` · ${item.sourceLabel}` : ''}
          </div>
          <h2 className="mt-0.5 truncate text-[15px] font-semibold tracking-tight text-neutral-900">
            {item.title}
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {item.href ? (
            item.hrefExternal ? (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="compass-btn-secondary shrink-0 !px-2.5 !py-1.5 text-[12px]"
              >
                Unibox
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <Link href={item.href} className="compass-btn-secondary shrink-0 !px-2.5 !py-1.5 text-[12px]">
                Open
              </Link>
            )
          ) : null}
          {item.gmailHref ? (
            <a
              href={item.gmailHref}
              target="_blank"
              rel="noopener noreferrer"
              className="compass-btn-secondary shrink-0 !px-2.5 !py-1.5 text-[12px]"
            >
              Gmail
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          {item.crmHref ? (
            <Link href={item.crmHref} className="compass-btn-secondary shrink-0 !px-2.5 !py-1.5 text-[12px]">
              CRM
            </Link>
          ) : null}
        </div>
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

        {item.tab === 'instantly' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {INSTANTLY_CLASSIFY_ACTIONS.map((action) => (
              <ActionButton
                key={action.id}
                disabled={busy}
                onClick={() => onClassify(action.id)}
              >
                {action.label}
              </ActionButton>
            ))}
          </div>
        ) : null}

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
          <div className="mt-5 rounded-xl border border-neutral-200/80 bg-neutral-50/70 px-3 py-3">
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
            <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 px-3 py-2.5 sm:col-span-2">
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

function mapInboxItems(
  items: InboxItem[],
  update: (item: InboxItem) => InboxItem | null
): InboxItem[] {
  const next: InboxItem[] = []
  for (const item of items) {
    const mapped = update(item)
    if (mapped) next.push(mapped)
  }
  return next
}

/** Apply a triage/lifecycle change locally so the UI responds before the network round-trip. */
function applyOptimisticInboxUpdate(
  itemId: string,
  patch: {
    triage: InboxTriageState
    unread?: boolean
    lifecycle?: LeadLifecycleStatus
    remove?: boolean
  }
) {
  const existing = peekQueryCache<InboxPayload>(INBOX_CACHE_KEY)
  if (!existing?.data) return

  const data = existing.data
  const channels = data.channels ?? {
    agents: data.tab === 'agents' ? data.items : [],
    instantly: data.tab === 'instantly' ? data.items : [],
    leads: data.tab === 'leads' ? data.items : []
  }

  const updateItem = (entry: InboxItem): InboxItem | null => {
    if (entry.id !== itemId) return entry
    if (patch.remove) return null
    return {
      ...entry,
      triage: patch.triage,
      unread: patch.unread ?? (patch.triage === 'unread'),
      lifecycle: patch.lifecycle ?? entry.lifecycle,
      snoozedUntil:
        patch.triage === 'snoozed'
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          : patch.triage === 'done' || patch.triage === 'read' || patch.triage === 'unread'
            ? null
            : entry.snoozedUntil
    }
  }

  const agents = mapInboxItems(channels.agents, updateItem)
  const instantly = mapInboxItems(channels.instantly, updateItem)
  const leads = mapInboxItems(channels.leads, updateItem)
  const counts = countActionableBadge({ agents, instantly, leads })
  const badgeTotal = counts.agents + counts.instantly + counts.leads
  const needsYou = pickNeedsYou([...agents, ...instantly, ...leads])
  const activeTab = data.tab
  const tabItems =
    activeTab === 'agents' ? agents : activeTab === 'instantly' ? instantly : leads

  writeQueryCache<InboxPayload>(INBOX_CACHE_KEY, {
    ...data,
    items: tabItems,
    total: tabItems.length,
    counts,
    badgeTotal,
    needsYou,
    channels: { agents, instantly, leads }
  })
}

export function InboxPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const viewPath = useConsoleViewPath()
  const activeRoute = pathname === '/inbox' && viewPath === '/inbox'
  const searchParams = useSearchParams()
  const tab = parseInboxTab(searchParams.get('tab'))
  const selectedParam = searchParams.get('id')
  const [mobileShowContext, setMobileShowContext] = useState(false)
  const backButton = useRef<HTMLButtonElement>(null)
  const returnToList = useRef(false)
  useEffect(() => {
    if (!window.matchMedia('(max-width: 1023px)').matches) return
    if (mobileShowContext) backButton.current?.focus()
    else if (returnToList.current) {
      document.getElementById(`inbox-row-${selectedParam}`)?.focus()
      returnToList.current = false
    }
  }, [mobileShowContext, selectedParam])
  const [suggestion, setSuggestion] = useState<InboxSuggestion | null>(null)
  const [busy, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const undo = useUndo()

  // One shared payload for all tabs — switching tabs is a local filter, not a refetch.
  const { data, error, loading, reload } = useCachedJson<InboxPayload>(
    INBOX_CACHE_KEY,
    INBOX_CACHE_KEY
  )

  const items = useMemo(() => itemsForInboxTab(data, tab), [data, tab])
  const counts = data?.counts
  const needsYou = data?.needsYou ?? []

  const selectedId = useMemo(() => {
    if (selectedParam && items.some((item) => item.id === selectedParam)) return selectedParam
    return items[0]?.id ?? null
  }, [items, selectedParam])

  const selected = items.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    if (!activeRoute || selectedParam || !items[0]?.id) return
    const params = new URLSearchParams()
    params.set('tab', tab)
    params.set('id', items[0].id)
    replaceInboxUrl(params)
  }, [activeRoute, items, pathname, selectedParam, tab])

  const loadSuggestion = useCallback(async (item: InboxItem, signal?: AbortSignal) => {
    setSuggestion(null)
    try {
      const res = await fetch('/api/inbox/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        signal,
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
      if (signal?.aborted || !res.ok) return
      const json = (await res.json()) as InboxSuggestion
      if (signal?.aborted) return
      setSuggestion(json)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Heuristic endpoint should rarely fail; ignore soft errors.
    }
  }, [])

  useEffect(() => {
    if (!activeRoute || !selected) {
      setSuggestion(null)
      return
    }
    const controller = new AbortController()
    void loadSuggestion(selected, controller.signal)
    return () => controller.abort()
  }, [activeRoute, selected, loadSuggestion])

  function setTab(next: InboxTab) {
    if (next === tab) return
    const params = new URLSearchParams()
    params.set('tab', next)
    setMobileShowContext(false)
    // Transition keeps the previous list painted while the URL/selection updates.
    startTransition(() => {
      replaceInboxUrl(params)
    })
  }

  function selectItem(item: InboxItem) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', item.tab)
    params.set('id', item.id)
    setMobileShowContext(true)
    startTransition(() => {
      replaceInboxUrl(params)
    })
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

    // Contacted/qualified stay in the leads queue; done/snooze/discard leave it.
    const shouldRemove =
      triage === 'done' ||
      triage === 'snoozed' ||
      opts?.lifecycle === 'discarded'

    applyOptimisticInboxUpdate(item.id, {
      triage,
      unread: triage === 'unread',
      lifecycle: opts?.lifecycle,
      remove: shouldRemove
    })

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
      await reload(true)
      return false
    }
    // Background reconcile — do not block the click path on a full refetch.
    void reload(false)
    return true
  }

  function onTriage(triage: InboxTriageState) {
    if (!selected) return
    startTransition(() => {
      void patchTriage(selected, triage)
    })
  }

  function onClassify(actionId: string) {
    if (!selected || selected.tab !== 'instantly') return
    const action = classifyAction(actionId)
    if (!action) return
    startTransition(() => {
      void (async () => {
        setActionError(null)
        const statusRes = await fetch('/api/leads/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            action: 'set_status',
            ids: [selected.sourceId],
            status: action.outboundStatus
          })
        })
        if (!statusRes.ok) {
          setActionError('Could not classify this reply')
          return
        }
        if (action.tag) {
          const tagRes = await fetch('/api/leads/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              action: 'add_tag',
              ids: [selected.sourceId],
              tag: action.tag
            })
          })
          if (!tagRes.ok) {
            setActionError('Classified, but could not tag bad offer')
          }
        }
        await patchTriage(selected, 'done')
        const leadId = selected.sourceId
        const prevStatus = selected.instantlyStatus || 'replied'
        const tag = action.tag
        const nextStatus = action.outboundStatus
        undo.push({
          label: 'Inbox classify',
          undo: async () => {
            await fetch('/api/leads/bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ action: 'set_status', ids: [leadId], status: prevStatus })
            })
            if (tag) {
              await fetch('/api/leads/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ action: 'clear_tag', ids: [leadId], tag })
              })
            }
          },
          redo: async () => {
            await fetch('/api/leads/bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ action: 'set_status', ids: [leadId], status: nextStatus })
            })
            if (tag) {
              await fetch('/api/leads/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ action: 'add_tag', ids: [leadId], tag })
              })
            }
          }
        })
      })()
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
        const today = new Date()
        const dueToday = [
          today.getFullYear(),
          String(today.getMonth() + 1).padStart(2, '0'),
          String(today.getDate()).padStart(2, '0')
        ].join('-')
        const fromSales = selected.tab === 'instantly' || selected.tab === 'leads'
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            title,
            notes,
            // Instantly opportunities land as high priority + due today so they
            // show on Home Priorities and My Tasks Today/Focus together.
            priority: selected.tab === 'instantly' ? 2 : 3,
            due: fromSales ? dueToday : null,
            task_type: fromSales ? 'SELL' : null,
            source: 'inbox'
          })
        })
        if (!res.ok) {
          setActionError('Could not create task')
          return
        }
        const created = (await res.json().catch(() => null)) as { id?: string } | null
        await patchTriage(selected, 'read')
        router.push(
          tasksHref({
            window: fromSales ? 'today' : 'focus',
            taskId: created?.id ?? null
          })
        )
      })()
    })
  }

  if (error && !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}{' '}
          <button type="button" className="underline" onClick={() => void reload(true)}>
            Retry inbox
          </button>
        </div>
      </div>
    )
  }

  // Only blank the panel on the very first load — tab switches never hit this gate.
  if (loading || !data) {
    return (
      <div className="flex flex-1 p-3 sm:p-4">
        <LoadingBlock label="Loading inbox…" />
      </div>
    )
  }

  const empty = EMPTY_COPY[tab]

  return (
    <div className="folio-inbox flex min-h-0 flex-1 flex-col p-3 sm:p-4">
      <div className="compass-panel flex min-h-0 flex-1 flex-col overflow-hidden text-neutral-900">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="compass-page-title-compact">Inbox</h1>
          <p className="truncate text-[12px] text-neutral-500">{INBOX_TAB_HINTS[tab]}</p>
        </div>
        <div className="shrink-0 rounded-xl bg-stone-50 px-2 py-1 text-[12px] tabular-nums text-neutral-500 ring-1 ring-stone-200/70">
          {data.badgeTotal} need{data.badgeTotal === 1 ? 's' : ''} you · {items.length} shown
        </div>
      </header>

      {needsYou.length > 0 ? (
        <div className="folio-inbox-priorities shrink-0 border-b border-stone-100 bg-stone-50/60 px-3 py-2.5">
          <div className="compass-section-label mb-1.5">Needs you</div>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {needsYou.map((item) => (
              <button
                key={`needs-${item.id}`}
                type="button"
                onClick={() => selectItem(item)}
                className={cn(
                  'inline-flex max-w-[220px] shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d2a]/40',
                  item.id === selectedId
                    ? 'border-[#e85d2a]/40 bg-[#e85d2a]/10 shadow-soft'
                    : 'border-stone-200 bg-white text-neutral-800 hover:border-stone-300'
                )}
              >
                <SourceGlyph tab={item.tab} />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-neutral-900">{item.title}</span>
                  <span className="block truncate text-[11px] text-neutral-500">
                    {INBOX_TAB_LABELS[item.tab]} · {formatInboxRelative(item.occurredAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="Inbox channels"
        className="mx-3 mt-2 flex shrink-0 gap-0.5 overflow-x-auto rounded-xl border border-stone-200/80 bg-stone-50/80 p-0.5 shadow-soft"
      >
        {INBOX_TABS.map((key) => {
          const count = counts?.[key] ?? 0
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`inbox-tab-${key}`}
              aria-selected={active}
              aria-controls={`inbox-panel-${key}`}
              tabIndex={active ? 0 : -1}
              onKeyDown={(event) => {
                const index = INBOX_TABS.indexOf(key)
                const nextIndex = event.key === 'ArrowRight' ? (index + 1) % INBOX_TABS.length
                  : event.key === 'ArrowLeft' ? (index + INBOX_TABS.length - 1) % INBOX_TABS.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? INBOX_TABS.length - 1 : null
                if (nextIndex === null) return
                event.preventDefault()
                const next = INBOX_TABS[nextIndex]
                setTab(next)
                document.getElementById(`inbox-tab-${next}`)?.focus()
              }}
              onClick={() => setTab(key)}
              className={cn(
                'compass-seg-btn inline-flex shrink-0 items-center gap-1.5',
                active && 'compass-seg-btn-active'
              )}
            >
              {INBOX_TAB_LABELS[key]}
              <span
                className={cn(
                  'rounded-md px-1 text-[11px] tabular-nums',
                  active ? 'bg-[#e85d2a]/10 text-[#c2410c]' : 'bg-stone-100 text-neutral-500'
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

      <div role="tabpanel" id={`inbox-panel-${tab}`} aria-labelledby={`inbox-tab-${tab}`} className="flex min-h-0 flex-1">
        <section
          className={cn(
            'folio-inbox-index flex min-h-0 w-full shrink-0 flex-col border-neutral-200/80 lg:w-[340px] lg:border-r xl:w-[380px]',
            mobileShowContext ? 'hidden lg:flex' : 'flex'
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
            'folio-inbox-case min-h-0 min-w-0 flex-1 bg-white',
            mobileShowContext ? 'flex' : 'hidden lg:flex'
          )}
        >
          <div className="flex min-h-0 w-full flex-col">
            {mobileShowContext ? (
              <button
                type="button"
                ref={backButton}
                className="border-b border-neutral-200 px-4 py-2 text-left text-[13px] text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c2410c] lg:hidden"
                onClick={() => {
                  returnToList.current = true
                  setMobileShowContext(false)
                }}
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
              onClassify={onClassify}
              onRefreshSuggest={() => {
                if (selected) void loadSuggestion(selected)
              }}
            />
          </div>
        </section>
      </div>
      </div>
    </div>
  )
}
