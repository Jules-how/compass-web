/**
 * Shared Linear-style priority scale for Compass tasks/projects/clients:
 * 0 = none, 1 = urgent, 2 = high, 3 = medium, 4 = low.
 * Lower non-zero numbers are more urgent.
 */

export const TASK_PRIORITIES = [
  { value: 0, label: 'No priority' },
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' }
] as const

export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number]['value']

export function normalizeTaskPriority(value: unknown): TaskPriorityValue {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  const rounded = Math.round(n)
  if (rounded <= 0) return 0
  if (rounded >= 4) return 4
  return rounded as TaskPriorityValue
}

/**
 * Map a 1–10 "do first" rank (legacy brain-dump / AI) into the 1–4 task scale.
 * 10–9 → 1 urgent, 8–7 → 2 high, 6–4 → 3 medium, 3–1 → 4 low.
 */
export function rank10ToPriority(rank: number): TaskPriorityValue {
  const r = Math.min(10, Math.max(1, Math.round(rank)))
  if (r >= 9) return 1
  if (r >= 7) return 2
  if (r >= 4) return 3
  return 4
}

/** Sort key: lower = more urgent. Unset (0) sorts after Low. */
export function prioritySortKey(priority: number | null | undefined): number {
  const p = normalizeTaskPriority(priority)
  return p === 0 ? 99 : p
}

export function taskPriorityLabel(priority: number | null | undefined): string {
  return TASK_PRIORITIES.find((row) => row.value === normalizeTaskPriority(priority))?.label ?? 'No priority'
}

/** Compact badge letter: U / H / M / L / — */
export function taskPriorityShort(priority: number | null | undefined): string {
  switch (normalizeTaskPriority(priority)) {
    case 1:
      return 'U'
    case 2:
      return 'H'
    case 3:
      return 'M'
    case 4:
      return 'L'
    default:
      return '—'
  }
}
