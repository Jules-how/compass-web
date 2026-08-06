'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingBlock } from '@/components/LoadingBlock'
import type { BrainDumpReorganizeResult, BrainDumpSuggestion } from '@/lib/brain-dump'
import {
  HOME_AD_DEMO,
  HOME_COLD_EMAIL_DEMO,
  type AdCreativeMetric,
  type ColdEmailGlance
} from '@/lib/home-demo-data'
import type { CompassProject, CompassTask } from '@/lib/types'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

const BRAIN_DUMP_KEY = 'compass.home.brainDump'

type TasksPayload = {
  topTasks: CompassTask[]
  projects: CompassProject[]
}

type InboxPayload = {
  total?: number
  leads?: unknown[]
}

type ColdEmailPayload = ColdEmailGlance & {
  source?: 'instantly' | 'demo' | 'error'
  warning?: string
  error?: string
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

function isOpenTask(task: CompassTask) {
  return task.status !== 'completed' && task.status !== 'cancelled'
}

function priorityRank(task: CompassTask) {
  const urgency =
    task.due && !Number.isNaN(Date.parse(task.due))
      ? Math.max(0, 14 - (Date.parse(task.due) - Date.now()) / 86_400_000)
      : 0
  const statusBoost = task.status === 'in-progress' ? 3 : task.status === 'blocked' ? 5 : 0
  return task.priority * 10 + statusBoost + urgency
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

function GlanceLink({
  href,
  label,
  value,
  hint,
  tone = 'neutral'
}: {
  href: string
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'action' | 'warn'
}) {
  return (
    <Link
      href={href}
      className={cn(
        'compass-panel block p-3.5 transition hover:border-stone-300 hover:bg-stone-50/60',
        tone === 'action' && 'border-[#e85d2a]/35 bg-orange-50/40',
        tone === 'warn' && 'border-amber-300/70 bg-amber-50/40'
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight text-neutral-900 tabular-nums">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-neutral-500">{hint}</div> : null}
    </Link>
  )
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-[#c2410c] hover:underline">
      {children}
    </Link>
  )
}

export function HomeDashboard() {
  const tasks = useCachedJson<TasksPayload>('/api/tasks', '/api/tasks')
  const inbox = useCachedJson<InboxPayload>('/api/inbox', '/api/inbox')
  const coldEmail = useCachedJson<ColdEmailPayload>(
    '/api/instantly/cold-email',
    '/api/instantly/cold-email',
    { staleMs: 60_000 }
  )
  const ads = HOME_AD_DEMO
  const cold: ColdEmailGlance = coldEmail.data ?? HOME_COLD_EMAIL_DEMO
  const coldLive = coldEmail.data?.source === 'instantly'

  const [dump, setDump] = useState('')
  const [dumpHydrated, setDumpHydrated] = useState(false)
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

  const openTasks = useMemo(() => {
    const list = (tasks.data?.topTasks ?? []).filter(isOpenTask)
    return [...list].sort((a, b) => priorityRank(b) - priorityRank(a))
  }, [tasks.data])

  const activeProjects = useMemo(() => {
    const list = (tasks.data?.projects ?? []).filter(
      (p) => !['done', 'completed', 'cancelled', 'archived'].includes(p.status.toLowerCase())
    )
    return [...list].sort((a, b) => b.priority - a.priority).slice(0, 4)
  }, [tasks.data])

  const priorities = openTasks.slice(0, 6)
  const focus = priorities[0] ?? null
  const blockedCount = openTasks.filter((t) => t.status === 'blocked').length
  const overdueCount = openTasks.filter(
    (t) => t.due && Date.parse(t.due) < Date.now() && t.status !== 'completed'
  ).length
  const inboxCount =
    typeof inbox.data?.total === 'number'
      ? inbox.data.total
      : Array.isArray(inbox.data?.leads)
        ? inbox.data.leads.length
        : null

  const projectsById = useMemo(
    () => Object.fromEntries((tasks.data?.projects ?? []).map((p) => [p.id, p])),
    [tasks.data]
  )

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
        `Added ${creatable.length} task${creatable.length === 1 ? '' : 's'} to priorities` +
          (projectCues
            ? ` · ${projectCues} project cue${projectCues === 1 ? '' : 's'} kept for Projects`
            : '') +
          '.'
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
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <GlanceLink
          href="/tasks"
          label="Start here"
          value={
            focus
              ? focus.title.length > 42
                ? `${focus.title.slice(0, 39)}…`
                : focus.title
              : 'Add a priority'
          }
          hint={
            focus
              ? focus.status === 'in-progress'
                ? 'In progress · continue'
                : 'Highest leverage open item'
              : 'Empty stack — capture or create'
          }
          tone="action"
        />
        <GlanceLink
          href="/inbox"
          label="Inbox"
          value={inboxCount == null ? '—' : String(inboxCount)}
          hint={inboxCount ? 'Needs a pass' : 'Clear'}
          tone={inboxCount && inboxCount > 0 ? 'warn' : 'neutral'}
        />
        <GlanceLink
          href="/sales"
          label="Replies waiting"
          value={
            coldEmail.loading && !coldEmail.data ? '—' : String(cold.repliesWaiting)
          }
          hint={
            coldLive
              ? 'Unread in Instantly Unibox'
              : coldEmail.error
                ? 'Instantly sync unavailable'
                : 'Positive / unanswered'
          }
          tone={cold.repliesWaiting > 0 ? 'warn' : 'neutral'}
        />
        <GlanceLink
          href="/tasks"
          label="Blocked / overdue"
          value={String(blockedCount + overdueCount)}
          hint={
            blockedCount || overdueCount
              ? `${blockedCount} blocked · ${overdueCount} overdue`
              : 'Nothing stuck'
          }
          tone={blockedCount + overdueCount > 0 ? 'warn' : 'neutral'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Today&apos;s Priorities</CardTitle>
              <CardDescription>
                Tasks and projects that should move the needle before anything else
              </CardDescription>
            </div>
            <SectionLink href="/tasks">Open tasks</SectionLink>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.error && !tasks.data ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {tasks.error}{' '}
                <button type="button" className="underline" onClick={() => void tasks.reload(true)}>
                  Retry
                </button>
              </div>
            ) : null}
            {tasks.loading && !tasks.data ? <LoadingBlock label="Loading priorities…" /> : null}
            {!tasks.loading && priorities.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-neutral-500">
                No open priorities yet. Capture a brain dump or{' '}
                <Link href="/tasks" className="font-medium text-[#c2410c] hover:underline">
                  create a task
                </Link>
                .
              </div>
            ) : null}
            {priorities.map((task, index) => {
              const project = task.project_id ? projectsById[task.project_id] : null
              return (
                <Link
                  key={task.id}
                  href="/tasks"
                  className="flex items-start gap-3 rounded-xl border border-stone-200/70 bg-stone-50/40 px-3.5 py-3 transition hover:border-stone-300 hover:bg-stone-50"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-xs font-semibold tabular-nums text-neutral-500 ring-1 ring-stone-200">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-neutral-900">{task.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-neutral-500">
                      <span className="capitalize">{task.status.replace('-', ' ')}</span>
                      {project ? <span>· {project.name}</span> : null}
                      {task.due ? <span>· due {task.due.slice(0, 10)}</span> : null}
                      {task.priority > 0 ? <span>· P{task.priority}</span> : null}
                    </div>
                  </div>
                </Link>
              )
            })}

            {activeProjects.length > 0 ? (
              <div className="border-t border-stone-200/80 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                    Active projects
                  </div>
                  <SectionLink href="/projects">All projects</SectionLink>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeProjects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="rounded-lg border border-stone-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-stone-300 hover:text-neutral-900"
                    >
                      {project.name}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Brain Dump</CardTitle>
              <CardDescription>
                Dump messy thoughts — AI turns them into ordered priorities you can apply
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={dump}
              onChange={(e) => {
                setDump(e.target.value)
                setApplyNote(null)
              }}
              placeholder="Messy thoughts, follow-ups, half-ideas… one line per thought works best."
              rows={10}
              className="w-full resize-y rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-[#e85d2a]/50 focus:outline-none focus:ring-1 focus:ring-[#e85d2a]/40"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void runReorganize()}
                disabled={!dump.trim() || reorganizing}
                className="rounded-lg bg-[#e85d2a] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#c2410c] disabled:opacity-50"
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
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-stone-50"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {applyNote ? (
              <p className="text-sm text-emerald-700">{applyNote}</p>
            ) : null}
            {reorganizeError ? <p className="text-sm text-red-600">{reorganizeError}</p> : null}
            {applyError ? <p className="text-sm text-red-600">{applyError}</p> : null}

            {plan ? (
              <div className="space-y-2 rounded-xl border border-stone-200/80 bg-stone-50/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-neutral-700">{plan.summary}</p>
                  {plan.source ? (
                    <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-neutral-400">
                      {plan.source === 'ai' ? 'AI' : 'Local'}
                    </span>
                  ) : null}
                </div>
                <ul className="space-y-2">
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
                    Parked notes: {plan.leftoverNotes.join(' · ')}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void applySuggestions()}
                  disabled={applying || selected.size === 0}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 transition hover:bg-stone-50 disabled:opacity-50"
                >
                  {applying ? 'Applying…' : 'Apply selected to priorities'}
                </button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ad creative / metrics</CardTitle>
            <CardDescription>
              Spend health and creatives that need a decision — not a full ads console
            </CardDescription>
          </div>
          <SectionLink href="/sales">Sales overview</SectionLink>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile
              label="Spend today"
              value={formatMoney(ads.spendToday)}
              hint={`${ads.spendDelta >= 0 ? '+' : ''}${ads.spendDelta}% vs yesterday`}
            />
            <MetricTile
              label="ROAS"
              value={`${ads.roas.toFixed(1)}x`}
              hint={`${ads.roasDelta >= 0 ? '+' : ''}${ads.roasDelta.toFixed(1)} vs 7d`}
            />
            <MetricTile label="CPA" value={formatMoney(ads.cpa)} hint="Blended" />
            <MetricTile
              label="Needs review"
              value={String(ads.creativesNeedingReview)}
              hint="Fatigued or underperforming"
              emphasize={ads.creativesNeedingReview > 0}
            />
          </div>
          <div className="space-y-2">
            {ads.creatives.map((creative) => (
              <div
                key={creative.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200/70 px-3.5 py-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-neutral-900">{creative.name}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {creative.channel} · {formatMoney(creative.spend)} spend · CTR {creative.ctr}%
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                  <span>
                    CPA <span className="font-medium text-neutral-800">{formatMoney(creative.cpa)}</span>
                  </span>
                  <span>
                    ROAS{' '}
                    <span className="font-medium text-neutral-800">{creative.roas.toFixed(1)}x</span>
                  </span>
                  {creativeStatusBadge(creative.status)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Cold email campaigns</CardTitle>
            <CardDescription>
              {coldLive
                ? 'Live from Instantly — jump into the planner when something stalls'
                : coldEmail.error
                  ? 'Instantly unavailable — showing last demo glance'
                  : 'Throughput and reply pressure — jump into the planner when something stalls'}
            </CardDescription>
          </div>
          <SectionLink href="/sales/pipeline">Campaign planner</SectionLink>
        </CardHeader>
        <CardContent className="space-y-4">
          {coldEmail.loading && !coldEmail.data ? (
            <LoadingBlock label="Loading Instantly campaigns…" />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  label="Sent today"
                  value={cold.emailsSentToday.toLocaleString()}
                  hint="Across live sequences"
                />
                <MetricTile
                  label="Replies waiting"
                  value={String(cold.repliesWaiting)}
                  hint="Unread in Unibox"
                  emphasize={cold.repliesWaiting > 0}
                />
                <MetricTile
                  label="Meetings booked"
                  value={String(cold.meetingsBooked)}
                  hint="Today"
                />
                <MetricTile label="Reply rate" value={`${cold.replyRate}%`} hint="Rolling 30d" />
              </div>
              <div className="space-y-2">
                {cold.campaigns.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-stone-200 px-3.5 py-6 text-center text-sm text-neutral-500">
                    No Instantly campaigns to show yet.
                  </div>
                ) : (
                  cold.campaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      className="rounded-xl border border-stone-200/70 bg-stone-50/40 p-3.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-neutral-900">{campaign.name}</div>
                          <div className="mt-0.5 text-xs text-neutral-500">
                            {campaign.sent.toLocaleString()} sent · {campaign.replies} replies ·{' '}
                            {campaign.meetings} meetings
                          </div>
                        </div>
                        {campaignStatusBadge(campaign.status)}
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-200/80">
                        <div
                          className="h-full rounded-full bg-[#e85d2a]"
                          style={{ width: `${campaign.progress}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MetricTile({
  label,
  value,
  hint,
  emphasize
}: {
  label: string
  value: string
  hint?: string
  emphasize?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-stone-200/70 bg-stone-50/50 p-3.5',
        emphasize && 'border-amber-300/70 bg-amber-50/50'
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight text-neutral-900 tabular-nums">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-neutral-500">{hint}</div> : null}
    </div>
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
    <li className="flex items-start gap-2.5 rounded-lg bg-white px-2.5 py-2 ring-1 ring-stone-200/80">
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
          <span className="text-[11px] tabular-nums text-neutral-400">P{item.suggestedPriority}</span>
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">{item.rationale}</p>
      </div>
    </li>
  )
}
