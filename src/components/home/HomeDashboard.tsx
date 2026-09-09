'use client'

import { workFetch } from '@/lib/workspace-change'

import { useCallback, useEffect, useState } from 'react'
import { ModalFrame } from '@/components/ui/ModalFrame'
import type { BrainDumpReorganizeResult, BrainDumpSuggestion } from '@/lib/brain-dump'
import type { HomePayload } from '@/lib/home-data'
import type { CompassTask } from '@/lib/types'
import type { MorningWavePayload } from '@/lib/wave-morning'
import { FolioHome } from '@/components/home/FolioHome'
import { useCachedJson } from '@/lib/use-cached-json'

const BRAIN_DUMP_KEY = 'compass.home.brainDump'

type TasksPayload = { topTasks: CompassTask[] }

export function HomeDashboard() {
  const home = useCachedJson<HomePayload>('/api/home', '/api/home', { staleMs: 60_000 })
  const tasks = useCachedJson<TasksPayload>('/api/tasks', '/api/tasks')
  const waveLive = useCachedJson<MorningWavePayload>('/api/home/wave', '/api/home/wave', {
    staleMs: 60_000
  })

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
  const wave = waveLive.data ?? data?.wave

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
      const res = await workFetch('/api/brain-dump/reorganize', {
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
        const res = await workFetch('/api/tasks', {
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

  return (
    <>
      <FolioHome data={data} wave={wave} tasks={tasks.data?.topTasks??[]} loading={home.loading} error={home.error} taskError={tasks.error} waveError={waveLive.error} note={dump} onCapture={()=>setDumpOpen(true)} onReload={async()=>{await Promise.all([home.reload(true),waveLive.reload(true),tasks.reload(true)])}}/>

      <ModalFrame
        open={dumpOpen}
        onClose={() => setDumpOpen(false)}
        labelledBy="brain-dump-title"
        overlayClassName="folio-overlay"
        contentClassName="folio-dialog folio-capture-dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
          <div>
            <h2 id="brain-dump-title" className="text-base font-semibold text-neutral-900">
              Capture a thought
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">Turn your notes into suggested tasks, then review what to add.</p>
          </div>
          <button type="button" onClick={() => setDumpOpen(false)} className="compass-btn-ghost">
            Close
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
          <textarea
            id="brain-dump-notes"
            value={dump}
            onChange={(e) => setDump(e.target.value)}
            placeholder="One thought per line…"
            rows={8}
            className="compass-input min-h-[10rem] flex-1 resize-y"
            aria-label="Brain dump notes"
          />
          <button type="button" onClick={() => void runReorganize()} disabled={!dump.trim() || reorganizing} className="compass-btn-primary">
            {reorganizing ? 'Organising…' : 'Review as tasks'}
          </button>
          {applyNote ? <p role="status" className="text-sm text-emerald-700">{applyNote}</p> : null}
          {reorganizeError ? <p role="alert" className="text-sm text-red-600">{reorganizeError}</p> : null}
          {applyError ? <p role="alert" className="text-sm text-red-600">{applyError}</p> : null}
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
      </ModalFrame>
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
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 h-3.5 w-3.5 rounded border-stone-300"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-neutral-900">{item.title}</span>
          <span className="mt-0.5 block text-xs text-neutral-500">{item.rationale}</span>
        </span>
      </label>
    </li>
  )
}
