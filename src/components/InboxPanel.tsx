'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

const EMPTY_COPY: Record<InboxTab, { title: string; body: string }> = {
  agents: {
    title: 'No agent notifications',
    body: 'When an agent finishes work or gets blocked, it will show up here for you to review.'
  },
  gmails: {
    title: 'No Gmail yet',
    body: 'Inbound Gmail that needs a reply or review will land in this tab once sync is connected.'
  },
  instantly: {
    title: 'No Instantly replies',
    body: 'Replies and positive Instantly interest will appear here as they come in.'
  },
  leads: {
    title: 'No inbound leads',
    body: 'Client website, guide, and Meta inbound leads will show up in this list.'
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
  const label =
    tab === 'agents' ? 'A' : tab === 'gmails' ? 'G' : tab === 'instantly' ? 'I' : 'L'
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
        tab === 'agents' && 'bg-amber-100 text-amber-800',
        tab === 'gmails' && 'bg-sky-100 text-sky-800',
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
        selected ? 'bg-sky-50/80' : 'hover:bg-neutral-50'
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

function ContextPane({ item }: { item: InboxItem | null }) {
  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <InboxEmptyIllustration />
        <div>
          <p className="text-sm font-medium text-neutral-700">Select a notification</p>
          <p className="mt-1 max-w-sm text-sm text-neutral-500">
            Context for the selected item shows here — contact details, source, and full summary.
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

  const url = `/api/inbox?tab=${tab}`
  const { data, error, loading, reload } = useCachedJson<InboxPayload>(url, url)

  const items = data?.items ?? []
  const counts = data?.counts

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

  function setTab(next: InboxTab) {
    const params = new URLSearchParams()
    params.set('tab', next)
    setMobileShowContext(false)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function selectItem(item: InboxItem) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    params.set('id', item.id)
    setMobileShowContext(true)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
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
          {data.total} item{data.total === 1 ? '' : 's'}
        </div>
      </header>

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
            <ContextPane item={items.length === 0 ? null : selected} />
          </div>
        </section>
      </div>
    </div>
  )
}
