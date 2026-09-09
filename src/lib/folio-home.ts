import type { CompassTask } from '@/lib/types'
import { prioritySortKey } from '@/lib/task-priority'

/** Waiting is a view of blocked work, never a new persisted status. */
export function selectHomeWork(tasks: CompassTask[]) {
  const unique = [...new Map(tasks.map((t) => [t.id, t])).values()]
  const open = unique.filter(
    (t) => !['completed', 'cancelled', 'done'].includes(t.status),
  )
  const ordered = (list: CompassTask[]) =>
    list.toSorted(
      (a, b) =>
        prioritySortKey(a.priority) - prioritySortKey(b.priority) ||
        (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
        a.title.localeCompare(b.title),
    )
  return {
    ready: ordered(open.filter((t) => t.status !== 'blocked')),
    waiting: ordered(open.filter((t) => t.status === 'blocked')),
  }
}
export function homeTaskNotes(notes: string | null | undefined) {
  return (notes ?? '').replace(/^daily_setup:[^\n]+\n*/, '').trim()
}
