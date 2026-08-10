'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { CompassProject, CompassTask } from '@/lib/types'
import {
  openTaskActionTarget,
  resolveTaskActionPlan,
  type TaskActionTarget
} from '@/lib/task-action-targets'
import { tasksHref } from '@/lib/task-organisation'
import { taskPriorityLabel } from '@/lib/task-priority'
import { cn } from '@/lib/utils'

const easeOut = [0.22, 1, 0.36, 1] as const

type HomePrioritySheetProps = {
  task: CompassTask
  project: CompassProject | null
  completing: boolean
  onClose: () => void
  onComplete: (task: CompassTask) => void | Promise<void>
}

export function HomePrioritySheet({
  task,
  project,
  completing,
  onClose,
  onComplete
}: HomePrioritySheetProps) {
  const plan = resolveTaskActionPlan(task)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleOpen(target: TaskActionTarget) {
    openTaskActionTarget(target)
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-10 sm:py-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-neutral-950/35"
          aria-label="Close priority"
          onClick={onClose}
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-priority-sheet-title"
          className="relative z-10 w-full max-w-lg rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.22, ease: easeOut }}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
                Priority
              </p>
              <h2
                id="home-priority-sheet-title"
                className="mt-0.5 text-lg font-semibold tracking-tight text-neutral-900"
              >
                {task.title}
              </h2>
              <div className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-neutral-500">
                <span className="capitalize">{task.status.replace('-', ' ')}</span>
                {task.priority > 0 ? <span>· {taskPriorityLabel(task.priority)}</span> : null}
                {project ? <span>· {project.name}</span> : null}
                {task.due ? <span>· {task.due.slice(0, 10)}</span> : null}
                {plan.contactName ? <span>· {plan.contactName}</span> : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-stone-200 px-2.5 py-1.5 text-xs text-neutral-600 transition hover:bg-stone-50"
            >
              Close
            </button>
          </div>

          <div className="rounded-xl border border-stone-100 bg-stone-50/50 px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
              Context
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
              {plan.context || 'No notes yet — open the tool and mark done when finished.'}
            </p>
          </div>

          <div className="mt-4 space-y-2">
            {plan.primary ? (
              <button
                type="button"
                onClick={() => handleOpen(plan.primary!)}
                className="compass-btn-primary w-full justify-center"
              >
                {plan.primary.label}
              </button>
            ) : null}

            {plan.secondary.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {plan.secondary.map((target) => (
                  <button
                    key={`${target.tool}:${target.url}`}
                    type="button"
                    onClick={() => handleOpen(target)}
                    className="compass-btn-secondary"
                  >
                    {target.label}
                  </button>
                ))}
              </div>
            ) : null}

            {!plan.primary && plan.secondary.length === 0 ? (
              <p className="text-xs text-neutral-500">
                No linked tool yet — finish it here or open in tasks.
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
            <button
              type="button"
              disabled={completing || task.status === 'completed'}
              onClick={() => void onComplete(task)}
              className="compass-btn-secondary"
            >
              {completing ? 'Completing…' : 'Mark done'}
            </button>
            <Link
              href={tasksHref({ window: 'focus', taskId: task.id })}
              className="text-xs font-medium text-[#c2410c] transition hover:underline"
              onClick={onClose}
            >
              Open in tasks
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

type HomePriorityCheckProps = {
  task: CompassTask
  completing: boolean
  onComplete: (task: CompassTask) => void | Promise<void>
  className?: string
}

export function HomePriorityCheck({
  task,
  completing,
  onComplete,
  className
}: HomePriorityCheckProps) {
  const done = task.status === 'completed'
  return (
    <button
      type="button"
      disabled={completing || done || task.status === 'cancelled'}
      aria-label={done ? 'Completed' : 'Mark as done'}
      onClick={(e) => {
        e.stopPropagation()
        if (!done) void onComplete(task)
      }}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
        done
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-stone-300 bg-white text-transparent hover:border-[#e85d2a]',
        (completing || task.status === 'cancelled') && 'cursor-not-allowed opacity-40',
        className
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
        <path
          d="M3.5 8.2 6.4 11l6.1-6.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

type UseHomePriorityActionsResult = {
  openTask: CompassTask | null
  completingId: string | null
  setOpenTask: (task: CompassTask | null) => void
  completeTask: (task: CompassTask) => Promise<void>
}

export function useHomePriorityActions(
  reload: (force?: boolean) => Promise<unknown>
): UseHomePriorityActionsResult {
  const [openTask, setOpenTask] = useState<CompassTask | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)

  async function completeTask(task: CompassTask) {
    if (completingId || task.status === 'completed' || task.status === 'cancelled') return
    setCompletingId(task.id)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ status: 'completed' })
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      if (openTask?.id === task.id) setOpenTask(null)
      await reload(true)
    } catch {
      /* keep sheet open; operator can retry */
    } finally {
      setCompletingId(null)
    }
  }

  return { openTask, completingId, setOpenTask, completeTask }
}
