'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingBlock } from '@/components/LoadingBlock'
import type { BrainDumpReorganizeResult, BrainDumpSuggestion } from '@/lib/brain-dump'
import type { HomePayload } from '@/lib/home-data'
import type { CompassTask } from '@/lib/types'
import { MorningWavePanel } from '@/components/home/MorningWavePanel'
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

  const data = home.data
  const cold = data?.coldEmail

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
          {data?.wave ? (
            <MorningWavePanel wave={data.wave} onReload={() => home.reload(true)} />
          ) : (
            <Card className="lg:col-span-2 xl:col-span-3">
              <CardContent className="p-4 sm:p-5">
                <p className="text-sm text-neutral-500">Morning wave did not load. Retry or check the brief tables.</p>
              </CardContent>
            </Card>
          )}

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
        </motion.div>
      </motion.div>

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
