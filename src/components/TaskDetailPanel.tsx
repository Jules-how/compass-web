'use client'

import { workFetch } from '@/lib/workspace-change'

import { useEffect, useRef, useState } from 'react'
import type {
  CompassBusinessFunction,
  CompassProject,
  CompassTask,
  TaskStatus,
  TaskType
} from '@/lib/types'
import { TASK_STATUSES, TASK_TYPES } from '@/lib/types'
import { ModalFrame } from '@/components/ui/ModalFrame'
import NotesEditor from '@/components/NotesEditor'
import { TASK_PRIORITIES } from '@/lib/task-priority'

interface TaskDetailPanelProps {
  task: CompassTask
  projectsById: Record<string, CompassProject>
  businessFunctionsById: Record<string, CompassBusinessFunction>
  onClose: () => void
  onChanged: () => void | Promise<void>
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
  cancelled: 'Cancelled'
}

export default function TaskDetailPanel({
  task,
  projectsById,
  businessFunctionsById,
  onClose,
  onChanged
}: TaskDetailPanelProps) {
  const loadedStamp = useRef(task.updated_at)
  const [title, setTitle] = useState(task.title)
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [priority, setPriority] = useState(task.priority)
  const [due, setDue] = useState(task.due ? task.due.slice(0, 10) : '')
  const [projectId, setProjectId] = useState(task.project_id ?? '')
  const [businessFunctionId, setBusinessFunctionId] = useState(task.business_function_id ?? '')
  const [taskType, setTaskType] = useState<TaskType | ''>(task.task_type ?? '')
  const [notes, setNotes] = useState(task.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTitle(task.title)
    setStatus(task.status)
    setPriority(task.priority)
    setDue(task.due ? task.due.slice(0, 10) : '')
    setProjectId(task.project_id ?? '')
    setBusinessFunctionId(task.business_function_id ?? '')
    setTaskType(task.task_type ?? '')
    setNotes(task.notes ?? '')
    setError(null)
    loadedStamp.current = task.updated_at
    // Background refresh must not replace a draft being edited. The save compares
    // the version opened here and returns a conflict if another writer changed it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  const projectOptions = Object.values(projectsById).sort((a, b) => a.name.localeCompare(b.name))
  const bfOptions = Object.values(businessFunctionsById).sort((a, b) => a.sort_order - b.sort_order)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await workFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_updated_at: loadedStamp.current,
          title: title.trim(),
          status,
          priority,
          due: due || null,
          project_id: projectId || null,
          business_function_id: businessFunctionId || null,
          task_type: taskType || null,
          notes: notes.trim() || null
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? body.error ?? `Request failed (${res.status})`)
      }
      await onChanged()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalFrame
      open
      onClose={onClose}
      labelledBy="task-detail-title"
      overlayClassName="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/40 px-4 py-10 sm:py-16"
      contentClassName="relative z-10 w-full max-w-2xl rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Task
          </p>
          <h2 id="task-detail-title" className="text-lg font-semibold text-neutral-900">
            Edit task
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-stone-200 px-2.5 py-1.5 text-xs text-neutral-600 transition hover:bg-stone-50"
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">Title</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="compass-input"
            disabled={saving}
          />
        </label>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full rounded-xl border border-stone-200 px-2 py-1.5 text-sm"
              disabled={saving}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full rounded-xl border border-stone-200 px-2 py-1.5 text-sm"
              disabled={saving}
            >
              {TASK_PRIORITIES.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Due</span>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-2 py-1.5 text-sm"
              disabled={saving}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Project</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-2 py-1.5 text-sm"
              disabled={saving}
            >
              <option value="">—</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Function</span>
            <select
              value={businessFunctionId}
              onChange={(e) => setBusinessFunctionId(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-2 py-1.5 text-sm"
              disabled={saving}
            >
              <option value="">—</option>
              {bfOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Type</span>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as TaskType | '')}
              className="w-full rounded-xl border border-stone-200 px-2 py-1.5 text-sm"
              disabled={saving}
            >
              <option value="">—</option>
              {TASK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">
            Definition of done / notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="compass-input"
            disabled={saving}
            placeholder="What done looks like"
          />
        </label>

        <div className="rounded-2xl border border-stone-200/70 bg-stone-50/50 p-4">
          <NotesEditor task={task} />
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="compass-btn-primary">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-stone-200 px-3 py-2 text-sm text-neutral-600 transition hover:bg-stone-50"
          >
            Cancel
          </button>
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        </div>
      </form>
    </ModalFrame>
  )
}
