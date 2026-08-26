'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingBlock } from '@/components/LoadingBlock'
import type { BrainDumpReorganizeResult, BrainDumpSuggestion } from '@/lib/brain-dump'
import type { HomePayload } from '@/lib/home-data'
import type { CompassTask } from '@/lib/types'
import { HomePrioritySheet } from '@/components/home/HomePriorityActions'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

const BRAIN_DUMP_KEY = 'compass.home.brainDump'

type TasksPayload = { topTasks: CompassTask[] }

const easeOut = [0.22, 1, 0.36, 1] as const

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.03 } }
}

const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: easeOut } }
}

function formatDayHeading(date: Date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function SectionHeader({ title, href, hint }: { title: string; href?: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-5 w-1 shrink-0 rounded-full bg-[#e85d2a]" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight text-neutral-900">{title}</h2>
        {hint ? <span className="text-xs text-neutral-400">{hint}</span> : null}
      </div>
      {href ? (
        <Link href={href} className="text-xs font-medium text-[#c2410c] hover:underline">
          Open
        </Link>
      ) : null}
    </div>
  )
}

export function HomeDashboard() {
  const home = useCachedJson<HomePayload>('/api/home', '/api/home', { staleMs: 60_000 })
  const tasks = useCachedJson<TasksPayload>('/api/tasks', '/api/tasks')

  const [dump, setDump] = useState('')
  const [dumpHydrated, setDumpHydrated] = useState(false)
  const [dumpOpen, setDumpOpen] = useState(false)
  const [plan, setPlan] = useState<(BrainDumpReorganizeResult & { source?: string }) | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reorganizing, setReorganizing] = useState(false)
  const [reorganizeError, setReorganizeError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyNote, setApplyNote] = useState<string | null>(null)
  const [undoingId, setUndoingId] = useState<string | null>(null)
  const [openTask, setOpenTask] = useState<CompassTask | null>(null)

  const data = home.data
  const cold = data?.coldEmail
  const digest = data?.digest

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(BRAIN_DUMP_KEY)
      if (saved) setDump(saved)
    } catch {
      /* ignore */
    }
    setDumpHydrated(true)
  }, [])

  useEffect(() => {
    if (!dumpHydrated) return
    try {
      window.localStorage.setItem(BRAIN_DUMP_KEY, dump)
    } catch {
      /* ignore */
    }
  }, [dump, dumpHydrated])

  const dumpPending = dump.trim().length > 0

  const runReorganize = useCallback(async () => {
    if (!dump.trim() || reorganizing) return
    setReorganizing(true)
    setReorganizeError(null)
    setApplyError(null)
    setApplyNote(null)
    try {
      const openTasks = (tasks.data?.topTasks ?? []).filter(
        (t) => t.status !== 'completed' && t.status !== 'cancelled'
      )
      const res = await fetch('/api/brain-dump/reorganize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          dump,
          existingTitles: openTasks.map((t) => t.title)
        })
      })
      const body = (await res.json().catch(() => ({}))) as BrainDumpReorganizeResult & {
        source?: string
        error?: string
      }
      if (!res.ok) throw new Error(body.error ?? `Reorganize failed (${res.status})`)
      setPlan(body)
      setSelected(new Set((body.suggestions ?? []).map((s) => s.id)))
    } catch (err) {
      setPlan(null)
      setSelected(new Set())
      setReorganizeError(err instanceof Error ? err.message : String(err))
    } finally {
      setReorganizing(false)
    }
  }, [dump, reorganizing, tasks.data])

  async function applySuggestions() {
    if (!plan) return
    const chosen = plan.suggestions.filter((s) => selected.has(s.id))
    if (chosen.length === 0) return
    setApplying(true)
    setApplyError(null)
    try {
      const creatable = chosen.filter((s) => s.kind === 'task' || s.kind === 'priority')
      for (const item of creatable) {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            title: item.title,
            priority: item.suggestedPriority,
            status: 'not-started',
            notes: `From brain dump · ${item.rationale}`
          })
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `Failed to create task (${res.status})`)
        }
      }
      setPlan(null)
      setSelected(new Set())
      setApplyNote(`Added ${creatable.length} task${creatable.length === 1 ? '' : 's'}`)
      await tasks.reload(true)
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  async function undoDone(taskId: string) {
    setUndoingId(taskId)
    try {
      const res = await fetch('/api/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo', task_id: taskId })
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Undo failed')
      }
      await home.reload(true)
      await tasks.reload(true)
    } catch (err) {
      console.error(err)
    } finally {
      setUndoingId(null)
    }
  }

  const spineRows = useMemo(() => {
    if (!data) return []
    return [...data.spine.leads, ...data.spine.clients]
  }, [data])

  if (home.error && !data) {
    return (
      <div className="p-6 text-sm text-red-700">
        {home.error}{' '}
        <button type="button" className="underline" onClick={() => void home.reload(true)}>
          Retry
        </button>
      </div>
    )
  }

  if (home.loading && !data) return <LoadingBlock label="Loading home…" />

  return (
    <>
      <motion.div
        className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3 sm:px-6 lg:px-8"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={staggerItem} className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              Operator home
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
              {formatDayHeading(new Date())}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setDumpOpen(true)}
            className={cn('compass-btn-secondary relative', dumpPending && 'ring-1 ring-[#e85d2a]/35')}
          >
            Brain dump
            {dumpPending ? (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#e85d2a] ring-2 ring-white" />
            ) : null}
          </button>
        </motion.div>

        <motion.div
          variants={staggerItem}
          className="grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain lg:grid-cols-2 xl:grid-cols-3"
        >
          <Card className="min-h-0">
            <CardContent className="p-4 sm:p-5">
              <SectionHeader title="Done" hint={digest?.completed.length ? String(digest.completed.length) : undefined} />
              {(digest?.completed ?? []).length === 0 ? (
                <p className="text-sm text-neutral-500">Digest will auto-complete proof tasks here.</p>
              ) : (
                <ul className="divide-y divide-stone-100 rounded-xl border border-stone-100 bg-stone-50/40">
                  {digest!.completed.map((item) => (
                    <li key={item.task_id} className="flex items-start justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-neutral-900">{item.title}</div>
                        <div className="mt-0.5 text-[11px] text-neutral-500">{item.why}</div>
                      </div>
                      <button
                        type="button"
                        disabled={undoingId === item.task_id}
                        onClick={() => void undoDone(item.task_id)}
                        className="compass-btn-ghost shrink-0 px-2 py-1 text-[11px]"
                      >
                        {undoingId === item.task_id ? '…' : 'Undo'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-0">
            <CardContent className="p-4 sm:p-5">
              <SectionHeader title="In flight" href="/tasks" />
              <div className="space-y-3">
                {(data?.inFlight ?? []).length > 0 ? (
                  <ul className="divide-y divide-stone-100 rounded-xl border border-stone-100 bg-stone-50/40">
                    {data!.inFlight.map((task) => (
                      <li key={task.id} className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-neutral-900">{task.title}</span>
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            {task.proven} of {task.total} proven
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-500">No partial proof tasks right now.</p>
                )}
                <div className="rounded-xl border border-stone-100 bg-stone-50/40 px-3 py-2.5 text-sm">
                  <span className="text-neutral-500">Live campaigns </span>
                  <span className="font-semibold tabular-nums text-neutral-900">
                    {data?.liveCampaignCount ?? 0}
                  </span>
                  <Link href="/sales/outbound" className="ml-2 text-xs font-medium text-[#c2410c] hover:underline">
                    Outbound
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0">
            <CardContent className="p-4 sm:p-5">
              <SectionHeader title="Needed" href="/tasks" />
              <div className="space-y-2">
                {[...(digest?.proposed ?? []), ...(digest?.needs_you ?? [])].map((item) => (
                  <div
                    key={item.key}
                    className="rounded-xl border border-stone-100 bg-stone-50/40 px-3 py-2.5"
                  >
                    <Link href={item.href} className="text-sm font-medium text-neutral-900 hover:underline">
                      {item.title}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-neutral-500">{item.reason}</p>
                  </div>
                ))}
                {(data?.overdueTasks ?? []).map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const full = tasks.data?.topTasks.find((t) => t.id === task.id)
                        if (full) setOpenTask(full)
                      }}
                      className="text-sm font-medium text-amber-900 hover:underline"
                    >
                      {task.title}
                    </button>
                    <p className="text-[11px] text-amber-800">Overdue · {task.due?.slice(0, 10)}</p>
                  </div>
                ))}
                {(digest?.proposed ?? []).length === 0 &&
                (digest?.needs_you ?? []).length === 0 &&
                (data?.overdueTasks ?? []).length === 0 ? (
                  <p className="text-sm text-neutral-500">Nothing queued — stack is clear.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <SectionHeader title="Emails going out" href="/sales/outbound" />
              <div className="flex flex-wrap gap-4">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
                    Sent today
                  </div>
                  <div className="text-2xl font-semibold tabular-nums text-neutral-900">
                    {cold?.emailsSentToday?.toLocaleString() ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
                    Reply rate
                  </div>
                  <div className="text-2xl font-semibold tabular-nums text-neutral-900">
                    {cold ? `${cold.replyRate}%` : '—'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <SectionHeader title="Replies coming in" href="/inbox?tab=instantly" />
              <div className="flex items-baseline justify-between gap-3 rounded-xl bg-amber-50/60 px-3 py-2.5">
                <span className="text-sm text-neutral-600">Waiting in Instantly</span>
                <span
                  className={cn(
                    'text-2xl font-semibold tabular-nums',
                    (cold?.repliesWaiting ?? 0) > 0 ? 'text-amber-900' : 'text-neutral-900'
                  )}
                >
                  {cold?.repliesWaiting ?? '—'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <SectionHeader title="Pull next" href={data?.pullNext?.href ?? '/leads'} />
              {data?.pullNext ? (
                <div className="rounded-xl border border-[#e85d2a]/20 bg-gradient-to-br from-orange-50/70 to-white p-3.5">
                  <div className="text-base font-semibold text-neutral-900">
                    {data.pullNext.vertical}
                    {data.pullNext.state ? ` · ${data.pullNext.state}` : ''}
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">
                    {data.pullNext.uncontacted.toLocaleString()} uncontacted with email
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">
                    Agent: {data.pullNext.agentQuery}
                  </p>
                  <Link
                    href={data.pullNext.href}
                    className="mt-3 inline-flex text-xs font-medium text-[#c2410c] hover:underline"
                  >
                    Open filtered leads
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Inventory is thin — import or widen filters.</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 xl:col-span-3">
            <CardContent className="p-4 sm:p-5">
              <SectionHeader title="Flow" href="/functions" />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {spineRows.map((row) => (
                  <Link
                    key={row.stage}
                    href={row.href}
                    className="rounded-xl border border-stone-100 bg-stone-50/40 px-3 py-2.5 transition hover:bg-white"
                  >
                    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
                      {row.stage}
                    </div>
                    <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-900">
                      {row.count.toLocaleString()}
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {openTask ? (
        <HomePrioritySheet
          task={openTask}
          project={null}
          completing={false}
          onClose={() => setOpenTask(null)}
          onComplete={async () => {}}
        />
      ) : null}

      <AnimatePresence>
        {dumpOpen ? (
          <motion.div className="fixed inset-0 z-50 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" className="absolute inset-0 bg-neutral-950/35" aria-label="Close brain dump" onClick={() => setDumpOpen(false)} />
            <motion.aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-stone-200/80 bg-white shadow-soft" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}>
              <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900">Brain dump</h2>
                  <p className="mt-0.5 text-xs text-neutral-500">Creates compass_tasks only</p>
                </div>
                <button type="button" onClick={() => setDumpOpen(false)} className="compass-btn-ghost">
                  Close
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
                <textarea value={dump} onChange={(e) => setDump(e.target.value)} placeholder="One thought per line…" rows={8} className="compass-input min-h-[10rem] flex-1 resize-y" autoFocus />
                <button type="button" onClick={() => void runReorganize()} disabled={!dump.trim() || reorganizing} className="compass-btn-primary">
                  {reorganizing ? 'Thinking…' : 'Reorganize with AI'}
                </button>
                {applyNote ? <p className="text-sm text-emerald-700">{applyNote}</p> : null}
                {reorganizeError ? <p className="text-sm text-red-600">{reorganizeError}</p> : null}
                {applyError ? <p className="text-sm text-red-600">{applyError}</p> : null}
                {plan ? (
                  <div className="space-y-3 border-t border-stone-100 pt-3">
                    <p className="text-sm text-neutral-700">{plan.summary}</p>
                    <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200/70">
                      {plan.suggestions.map((item) => (
                        <SuggestionRow key={item.id} item={item} checked={selected.has(item.id)} onToggle={() => {
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (next.has(item.id)) next.delete(item.id)
                            else next.add(item.id)
                            return next
                          })
                        }} />
                      ))}
                    </ul>
                    <button type="button" onClick={() => void applySuggestions()} disabled={applying || selected.size === 0} className="compass-btn-secondary">
                      {applying ? 'Applying…' : 'Apply selected'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

function SuggestionRow({
  item,
  checked,
  onToggle
}: {
  item: BrainDumpSuggestion
  checked: boolean
  onToggle: () => void
}) {
  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5">
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 h-3.5 w-3.5 rounded border-stone-300" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-neutral-900">{item.title}</div>
        <p className="mt-0.5 text-xs text-neutral-500">{item.rationale}</p>
      </div>
    </li>
  )
}
