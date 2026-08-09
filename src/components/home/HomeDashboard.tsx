'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingBlock } from '@/components/LoadingBlock'
import type { BrainDumpReorganizeResult, BrainDumpSuggestion } from '@/lib/brain-dump'
import {
  HOME_AD_DEMO,
  HOME_COLD_EMAIL_DEMO,
  type AdCreativeMetric,
  type ColdEmailGlance,
  type HomeAdGlance
} from '@/lib/home-demo-data'
import type { CompassProject, CompassTask } from '@/lib/types'
import { compareTasksByFocus, isOpenTask, type TaskFocusContext } from '@/lib/task-organisation'
import { taskPriorityLabel } from '@/lib/task-priority'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

const BRAIN_DUMP_KEY = 'compass.home.brainDump'

type TasksPayload = {
  topTasks: CompassTask[]
  projects: CompassProject[]
  clientsById?: Record<string, { id: string; name: string; priority: number; health: string }>
}

type InboxPayload = {
  total?: number
  badgeTotal?: number
  leads?: unknown[]
}

type ColdEmailPayload = ColdEmailGlance & {
  source?: 'instantly' | 'demo' | 'error'
  warning?: string
  error?: string
}

type AdsGlancePayload = HomeAdGlance & {
  source?: 'live' | 'demo'
  syncedAt?: string | null
  connectedAccounts?: number
  migrationRequired?: boolean
}

type DayBucket = {
  key: string
  label: string
  tasks: CompassTask[]
}

const easeOut = [0.22, 1, 0.36, 1] as const

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 }
  }
}

const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: easeOut }
  }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number) {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}

function formatDayHeading(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
}

function bucketTasksByPlate(tasks: CompassTask[]): DayBucket[] {
  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)
  const weekEnd = addDays(today, 7)

  const buckets: Record<string, CompassTask[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    week: [],
    later: []
  }

  for (const task of tasks) {
    if (!task.due) {
      buckets.later.push(task)
      continue
    }
    const due = startOfDay(new Date(task.due))
    if (Number.isNaN(due.getTime())) {
      buckets.later.push(task)
      continue
    }
    if (due < today) buckets.overdue.push(task)
    else if (due.getTime() === today.getTime()) buckets.today.push(task)
    else if (due.getTime() === tomorrow.getTime()) buckets.tomorrow.push(task)
    else if (due < weekEnd) buckets.week.push(task)
    else buckets.later.push(task)
  }

  const result: DayBucket[] = []
  if (buckets.overdue.length) result.push({ key: 'overdue', label: 'Overdue', tasks: buckets.overdue })
  result.push({ key: 'today', label: 'Today', tasks: buckets.today })
  result.push({ key: 'tomorrow', label: 'Tomorrow', tasks: buckets.tomorrow })
  if (buckets.week.length) {
    result.push({ key: 'week', label: 'This week', tasks: buckets.week })
  }
  if (buckets.later.length) {
    result.push({ key: 'later', label: 'Later / unscheduled', tasks: buckets.later })
  }
  return result
}

function creativeStatusBadge(status: AdCreativeMetric['status']) {
  switch (status) {
    case 'winning':
      return (
        <Badge variant="success" appearance="light" size="sm">
          Winning
        </Badge>
      )
    case 'learning':
      return (
        <Badge variant="primary" appearance="light" size="sm">
          Learning
        </Badge>
      )
    case 'fatigued':
      return (
        <Badge variant="warning" appearance="light" size="sm">
          Fatigued
        </Badge>
      )
    case 'needs-review':
      return (
        <Badge variant="destructive" appearance="light" size="sm">
          Needs review
        </Badge>
      )
  }
}

function campaignStatusBadge(status: 'live' | 'launching' | 'paused') {
  switch (status) {
    case 'live':
      return (
        <Badge variant="success" appearance="light" size="sm">
          Live
        </Badge>
      )
    case 'launching':
      return (
        <Badge variant="primary" appearance="light" size="sm">
          Launching
        </Badge>
      )
    case 'paused':
      return (
        <Badge variant="warning" appearance="light" size="sm">
          Paused
        </Badge>
      )
  }
}

function DemoMark({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-700 ring-1 ring-red-200/80">
      Demo
    </span>
  )
}

function PulseStat({
  href,
  value,
  label,
  hot
}: {
  href: string
  value: string
  label: string
  hot?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-baseline justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-stone-50/90',
        hot && 'bg-amber-50/60 hover:bg-amber-50/90'
      )}
    >
      <span className="text-sm text-neutral-500">{label}</span>
      <span
        className={cn(
          'text-lg font-semibold tabular-nums tracking-tight text-neutral-900',
          hot && 'text-amber-900'
        )}
      >
        {value}
      </span>
    </Link>
  )
}

function MiniMetric({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 text-base font-semibold tabular-nums tracking-tight text-neutral-900',
          hot && 'text-[#c2410c]'
        )}
      >
        {value}
      </div>
    </div>
  )
}

export function HomeDashboard() {
  const tasks = useCachedJson<TasksPayload>('/api/tasks', '/api/tasks')
  const inbox = useCachedJson<InboxPayload>('/api/inbox', '/api/inbox')
  const adsGlance = useCachedJson<AdsGlancePayload>('/api/ads/glance', '/api/ads/glance')
  const ads = adsGlance.data ?? HOME_AD_DEMO
  const adsSource = adsGlance.data?.source ?? 'demo'
  const coldEmail = useCachedJson<ColdEmailPayload>(
    '/api/instantly/cold-email',
    '/api/instantly/cold-email',
    { staleMs: 60_000 }
  )
  const cold: ColdEmailGlance = coldEmail.data ?? HOME_COLD_EMAIL_DEMO
  const coldLive = coldEmail.data?.source === 'instantly'
  const coldDemo = !coldLive

  const [dump, setDump] = useState('')
  const [dumpHydrated, setDumpHydrated] = useState(false)
  const [dumpOpen, setDumpOpen] = useState(false)
  const [plan, setPlan] = useState<(BrainDumpReorganizeResult & { source?: string }) | null>(
    null
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reorganizing, setReorganizing] = useState(false)
  const [reorganizeError, setReorganizeError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyNote, setApplyNote] = useState<string | null>(null)

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

  useEffect(() => {
    if (!dumpOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDumpOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dumpOpen])

  const openTasks = useMemo(() => {
    const list = (tasks.data?.topTasks ?? []).filter(isOpenTask)
    const projectsByIdLocal = Object.fromEntries(
      (tasks.data?.projects ?? []).map((p) => [p.id, p])
    )
    const clientsById = tasks.data?.clientsById ?? {}
    const ctxOf = (task: CompassTask): TaskFocusContext => {
      const project = task.project_id ? projectsByIdLocal[task.project_id] : null
      const client = project?.client_id ? clientsById[project.client_id] : null
      return { project, client }
    }
    return [...list].sort((a, b) => compareTasksByFocus(a, b, ctxOf))
  }, [tasks.data])

  const activeProjects = useMemo(() => {
    const list = (tasks.data?.projects ?? []).filter(
      (p) => !['done', 'completed', 'cancelled', 'archived'].includes(p.status.toLowerCase())
    )
    return [...list]
      .sort((a, b) => {
        const rank = (p: number) => (p === 0 ? 99 : p)
        return rank(a.priority) - rank(b.priority) || a.name.localeCompare(b.name)
      })
      .slice(0, 8)
  }, [tasks.data])

  const plateBuckets = useMemo(() => bucketTasksByPlate(openTasks), [openTasks])
  const focus = openTasks[0] ?? null
  const blockedCount = openTasks.filter((t) => t.status === 'blocked').length
  const overdueCount = openTasks.filter(
    (t) => t.due && Date.parse(t.due) < Date.now() && t.status !== 'completed'
  ).length
  const inboxCount =
    typeof inbox.data?.badgeTotal === 'number'
      ? inbox.data.badgeTotal
      : typeof inbox.data?.total === 'number'
        ? inbox.data.total
        : Array.isArray(inbox.data?.leads)
          ? inbox.data.leads.length
          : null

  const projectsById = useMemo(
    () => Object.fromEntries((tasks.data?.projects ?? []).map((p) => [p.id, p])),
    [tasks.data]
  )

  const clientsById = tasks.data?.clientsById ?? {}
  const dumpPending = dump.trim().length > 0

  const runReorganize = useCallback(async () => {
    if (!dump.trim() || reorganizing) return
    setReorganizing(true)
    setReorganizeError(null)
    setApplyError(null)
    setApplyNote(null)
    try {
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
      if (!res.ok) {
        throw new Error(body.error ?? `Reorganize failed (${res.status})`)
      }
      setPlan(body)
      setSelected(new Set((body.suggestions ?? []).map((s) => s.id)))
    } catch (err) {
      setPlan(null)
      setSelected(new Set())
      setReorganizeError(err instanceof Error ? err.message : String(err))
    } finally {
      setReorganizing(false)
    }
  }, [dump, openTasks, reorganizing])

  function toggleSuggestion(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applySuggestions() {
    if (!plan) return
    const chosen = plan.suggestions.filter((s) => selected.has(s.id))
    if (chosen.length === 0) return

    setApplying(true)
    setApplyError(null)
    setApplyNote(null)
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

      const appliedLines = new Set(chosen.map((s) => s.sourceLine.toLowerCase()))
      const remaining = dump
        .split(/\r?\n/)
        .filter((line) => {
          const normalized = line.replace(/^[\s>*\-•\d.]+/, '').trim().toLowerCase()
          return normalized && !appliedLines.has(normalized)
        })
        .join('\n')
      setDump(remaining.trim())

      const projectCues = chosen.filter((s) => s.kind === 'project').length
      setApplyNote(
        `Added ${creatable.length} task${creatable.length === 1 ? '' : 's'}` +
          (projectCues
            ? ` · ${projectCues} project cue${projectCues === 1 ? '' : 's'} parked`
            : '')
      )
      setPlan(null)
      setSelected(new Set())
      await tasks.reload(true)
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      <motion.div
        className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3 sm:px-6 lg:px-8"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div
          variants={staggerItem}
          className="flex shrink-0 flex-wrap items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              On your plate
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
              {formatDayHeading(new Date())}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setDumpOpen(true)}
            className={cn(
              'compass-btn-secondary relative',
              dumpPending && 'ring-1 ring-[#e85d2a]/35'
            )}
          >
            Brain dump
            {dumpPending ? (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#e85d2a] ring-2 ring-white" />
            ) : null}
          </button>
        </motion.div>

        {/* One composition: plate + pulse + engines in a single viewport */}
        <motion.div
          variants={staggerItem}
          className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)_auto]"
        >
          <Card className="min-h-0 overflow-hidden lg:col-span-2 lg:row-span-1">
            <CardContent className="flex h-full min-h-0 flex-col p-4 sm:p-5">
              <div className="mb-2.5 flex shrink-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-5 w-1 shrink-0 rounded-full bg-[#e85d2a]" aria-hidden />
                  <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                    Priorities
                  </h2>
                  <span className="text-xs tabular-nums text-neutral-400">
                    {openTasks.length}
                  </span>
                </div>
                <Link
                  href="/tasks"
                  className="text-xs font-medium text-[#c2410c] transition hover:text-[#9a3412] hover:underline"
                >
                  All tasks
                </Link>
              </div>

              {tasks.error && !tasks.data ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {tasks.error}{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void tasks.reload(true)}
                  >
                    Retry
                  </button>
                </div>
              ) : null}

              {tasks.loading && !tasks.data ? (
                <LoadingBlock label="Loading plate…" />
              ) : null}

              {!tasks.loading && openTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-300/80 bg-stone-50/40 px-4 py-8 text-center text-sm text-neutral-500">
                  Clear plate.{' '}
                  <button
                    type="button"
                    onClick={() => setDumpOpen(true)}
                    className="font-medium text-[#c2410c] hover:underline"
                  >
                    Capture a thought
                  </button>{' '}
                  or{' '}
                  <Link href="/tasks" className="font-medium text-[#c2410c] hover:underline">
                    add a task
                  </Link>
                  .
                </div>
              ) : null}

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-0.5">
                {focus && openTasks.length > 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: easeOut, delay: 0.12 }}
                    className="rounded-xl border border-[#e85d2a]/20 bg-gradient-to-br from-orange-50/70 to-white px-3.5 py-2.5"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#c2410c]">
                      Focus
                    </div>
                    <Link
                      href="/tasks"
                      className="mt-1 block truncate text-base font-semibold tracking-tight text-neutral-900 hover:underline"
                    >
                      {focus.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-neutral-500">
                      <span className="capitalize">{focus.status.replace('-', ' ')}</span>
                      {focus.project_id && projectsById[focus.project_id] ? (
                        <span>· {projectsById[focus.project_id].name}</span>
                      ) : null}
                      {focus.due ? <span>· {focus.due.slice(0, 10)}</span> : null}
                    </div>
                  </motion.div>
                ) : null}

                {plateBuckets.map((bucket) => {
                  if (bucket.tasks.length === 0) return null
                  return (
                    <div key={bucket.key}>
                      <div
                        className={cn(
                          'mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]',
                          bucket.key === 'overdue' ? 'text-amber-700' : 'text-neutral-400'
                        )}
                      >
                        {bucket.label}
                        <span className="ml-1.5 tabular-nums text-neutral-300">
                          {bucket.tasks.length}
                        </span>
                      </div>
                      <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-100 bg-stone-50/40">
                        {bucket.tasks.map((task) => {
                          const project = task.project_id
                            ? projectsById[task.project_id]
                            : null
                          return (
                            <li key={task.id}>
                              <Link
                                href="/tasks"
                                className="flex items-start gap-2.5 px-3 py-2 transition hover:bg-white"
                              >
                                <span
                                  className={cn(
                                    'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                                    task.status === 'blocked'
                                      ? 'bg-amber-500'
                                      : task.status === 'in-progress'
                                        ? 'bg-[#e85d2a]'
                                        : 'bg-stone-300'
                                  )}
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium text-neutral-900">
                                    {task.title}
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-neutral-500">
                                    <span className="capitalize">
                                      {task.status.replace('-', ' ')}
                                    </span>
                                    {project ? <span>{project.name}</span> : null}
                                    {task.priority > 0 ? (
                                      <span>{taskPriorityLabel(task.priority)}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden lg:row-span-1">
            <CardContent className="flex h-full min-h-0 flex-col overflow-y-auto p-4 sm:p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-neutral-900">Pulse</h2>
                {(coldDemo || adsSource !== 'live') && (
                  <div className="flex items-center gap-1.5">
                    <DemoMark show={coldDemo || adsSource !== 'live'} />
                  </div>
                )}
              </div>

              <div className="divide-y divide-stone-100 rounded-xl border border-stone-100 bg-stone-50/40">
                <PulseStat
                  href="/inbox"
                  label="Inbox"
                  value={inboxCount == null ? '—' : String(inboxCount)}
                  hot={Boolean(inboxCount && inboxCount > 0)}
                />
                <PulseStat
                  href="/sales"
                  label="Replies"
                  value={
                    coldEmail.loading && !coldEmail.data
                      ? '—'
                      : String(cold.repliesWaiting)
                  }
                  hot={cold.repliesWaiting > 0}
                />
                <PulseStat
                  href="/tasks"
                  label="Blocked"
                  value={String(blockedCount)}
                  hot={blockedCount > 0}
                />
                <PulseStat
                  href="/tasks"
                  label="Overdue"
                  value={String(overdueCount)}
                  hot={overdueCount > 0}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-stone-100 pt-3">
                <MiniMetric
                  label="Sent today"
                  value={
                    coldEmail.loading && !coldEmail.data
                      ? '—'
                      : cold.emailsSentToday.toLocaleString()
                  }
                />
                <MiniMetric label="Reply rate" value={`${cold.replyRate}%`} />
                <MiniMetric
                  label="Ad spend"
                  value={
                    adsGlance.loading && !adsGlance.data
                      ? '—'
                      : formatMoney(ads.spendToday)
                  }
                />
                <MiniMetric
                  label="ROAS"
                  value={
                    adsGlance.loading && !adsGlance.data ? '—' : `${ads.roas.toFixed(1)}x`
                  }
                  hot={ads.creativesNeedingReview > 0}
                />
              </div>

              <p className="mt-auto pt-3 text-xs leading-relaxed text-neutral-400">
                {overdueCount + blockedCount + (inboxCount ?? 0) + cold.repliesWaiting === 0
                  ? 'Quiet morning — stack is clear.'
                  : 'Pressure + engines in one glance.'}
              </p>
            </CardContent>
          </Card>

          {/* Peer engines — pinned to bottom of composition */}
          <Card className="min-h-0 lg:col-span-1">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                    Cold email
                  </h2>
                  <DemoMark show={coldDemo} />
                </div>
                <Link
                  href="/sales/pipeline"
                  className="shrink-0 text-xs font-medium text-[#c2410c] transition hover:underline"
                >
                  Planner
                </Link>
              </div>

              {coldEmail.loading && !coldEmail.data ? (
                <LoadingBlock label="Loading…" />
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
                    <MiniMetric
                      label="Sent"
                      value={cold.emailsSentToday.toLocaleString()}
                    />
                    <MiniMetric
                      label="Waiting"
                      value={String(cold.repliesWaiting)}
                      hot={cold.repliesWaiting > 0}
                    />
                    <MiniMetric label="Reply %" value={`${cold.replyRate}%`} />
                  </div>
                  <ul className="space-y-1">
                    {cold.campaigns.length === 0 ? (
                      <li className="rounded-xl border border-dashed border-stone-200 px-3 py-3 text-center text-xs text-neutral-500">
                        No campaigns
                      </li>
                    ) : (
                      cold.campaigns.slice(0, 2).map((campaign) => (
                        <li
                          key={campaign.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-stone-50/50 px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-neutral-900">
                              {campaign.name}
                            </div>
                            <div className="text-[11px] tabular-nums text-neutral-500">
                              {campaign.sent.toLocaleString()} · {campaign.replies} replies
                            </div>
                          </div>
                          {campaignStatusBadge(campaign.status)}
                        </li>
                      ))
                    )}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-0">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-neutral-900">Ads</h2>
                  <DemoMark show={adsSource !== 'live'} />
                </div>
                <Link
                  href="/settings"
                  className="shrink-0 text-xs font-medium text-[#c2410c] transition hover:underline"
                >
                  {adsSource === 'live' ? 'Accounts' : 'Connect'}
                </Link>
              </div>

              {adsGlance.loading && !adsGlance.data ? (
                <LoadingBlock label="Loading…" />
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
                    <MiniMetric label="Spend" value={formatMoney(ads.spendToday)} />
                    <MiniMetric label="ROAS" value={`${ads.roas.toFixed(1)}x`} />
                    <MiniMetric
                      label="Review"
                      value={String(ads.creativesNeedingReview)}
                      hot={ads.creativesNeedingReview > 0}
                    />
                  </div>
                  <ul className="space-y-1">
                    {ads.creatives.slice(0, 2).map((creative) => (
                      <li
                        key={creative.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-stone-50/50 px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-neutral-900">
                            {creative.name}
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            {creative.channel} · {creative.roas.toFixed(1)}x
                          </div>
                        </div>
                        {creativeStatusBadge(creative.status)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-0">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
                  Projects
                </h2>
                <Link
                  href="/projects"
                  className="shrink-0 text-xs font-medium text-[#c2410c] transition hover:underline"
                >
                  All
                </Link>
              </div>

              {tasks.loading && !tasks.data ? (
                <LoadingBlock label="Loading…" />
              ) : activeProjects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-200 px-3 py-3 text-center text-xs text-neutral-500">
                  No active projects
                </div>
              ) : (
                <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-100 bg-stone-50/40">
                  {activeProjects.slice(0, 4).map((project) => {
                    const client = project.client_id
                      ? clientsById[project.client_id]
                      : null
                    return (
                      <li key={project.id}>
                        <Link
                          href={`/projects/${project.id}`}
                          className="flex items-start justify-between gap-2 px-2.5 py-1.5 transition hover:bg-white"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-neutral-900">
                              {project.name}
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-neutral-500">
                              <span className="capitalize">{project.status}</span>
                              {client ? <span>{client.name}</span> : null}
                            </div>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Brain dump drawer */}
      <AnimatePresence>
        {dumpOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-neutral-950/35"
              aria-label="Close brain dump"
              onClick={() => setDumpOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="brain-dump-title"
              className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-stone-200/80 bg-white shadow-soft"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.28, ease: easeOut }}
            >
              <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
                <div>
                  <h2
                    id="brain-dump-title"
                    className="text-base font-semibold tracking-tight text-neutral-900"
                  >
                    Brain dump
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    One thought per line — reorganize into priorities
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDumpOpen(false)}
                  className="rounded-xl border border-stone-200 px-2.5 py-1.5 text-xs text-neutral-600 transition hover:bg-stone-50"
                >
                  Close
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
                <textarea
                  value={dump}
                  onChange={(e) => {
                    setDump(e.target.value)
                    setApplyNote(null)
                  }}
                  placeholder="Follow-ups, half-ideas, blockers…"
                  rows={8}
                  className="compass-input min-h-[10rem] flex-1 resize-y"
                  autoFocus
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runReorganize()}
                    disabled={!dump.trim() || reorganizing}
                    className="compass-btn-primary"
                  >
                    {reorganizing ? 'Thinking…' : 'Reorganize with AI'}
                  </button>
                  {dump.trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDump('')
                        setPlan(null)
                        setApplyNote(null)
                        setReorganizeError(null)
                      }}
                      className="compass-btn-ghost"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>

                {applyNote ? <p className="text-sm text-emerald-700">{applyNote}</p> : null}
                {reorganizeError ? (
                  <p className="text-sm text-red-600">{reorganizeError}</p>
                ) : null}
                {applyError ? <p className="text-sm text-red-600">{applyError}</p> : null}

                {plan ? (
                  <div className="space-y-3 border-t border-stone-100 pt-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm text-neutral-700">{plan.summary}</p>
                      {plan.source ? (
                        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-neutral-400">
                          {plan.source === 'ai' ? 'AI' : 'Local'}
                        </span>
                      ) : null}
                    </div>
                    <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200/70 bg-white">
                      {plan.suggestions.map((item) => (
                        <SuggestionRow
                          key={item.id}
                          item={item}
                          checked={selected.has(item.id)}
                          onToggle={() => toggleSuggestion(item.id)}
                        />
                      ))}
                    </ul>
                    {plan.leftoverNotes.length > 0 ? (
                      <p className="text-xs text-neutral-500">
                        Parked: {plan.leftoverNotes.join(' · ')}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void applySuggestions()}
                      disabled={applying || selected.size === 0}
                      className="compass-btn-secondary"
                    >
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
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 h-3.5 w-3.5 rounded border-stone-300 text-[#e85d2a] focus:ring-[#e85d2a]"
        aria-label={`Select ${item.title}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-neutral-900">{item.title}</span>
          <Badge variant="secondary" appearance="light" size="sm">
            {item.kind}
          </Badge>
          <span className="text-[11px] tabular-nums text-neutral-400">
            {taskPriorityLabel(item.suggestedPriority)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">{item.rationale}</p>
      </div>
    </li>
  )
}
