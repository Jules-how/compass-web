export const PROJECT_STATUSES = [
  'backlog',
  'planned',
  'in_progress',
  'completed',
  'canceled',
  // legacy values still accepted from desktop sync
  'active',
  'paused',
  'archived'
] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_BOARD_STATUSES = [
  'backlog',
  'planned',
  'in_progress',
  'completed',
  'canceled'
] as const

export type ProjectBoardStatus = (typeof PROJECT_BOARD_STATUSES)[number]

export const PROJECT_HEALTHS = ['no_updates', 'on_track', 'at_risk', 'off_track'] as const
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number]

export const PROJECT_PRIORITIES = [
  { value: 0, label: 'No priority' },
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' }
] as const

export function normalizeProjectStatus(status: string | null | undefined): ProjectBoardStatus {
  switch (status) {
    case 'planned':
    case 'paused':
      return 'planned'
    case 'in_progress':
    case 'active':
      return 'in_progress'
    case 'completed':
    case 'archived':
      return 'completed'
    case 'canceled':
    case 'cancelled':
      return 'canceled'
    case 'backlog':
    default:
      return 'backlog'
  }
}

export function projectStatusLabel(status: string | null | undefined): string {
  switch (normalizeProjectStatus(status)) {
    case 'planned':
      return 'Planned'
    case 'in_progress':
      return 'In Progress'
    case 'completed':
      return 'Completed'
    case 'canceled':
      return 'Canceled'
    case 'backlog':
    default:
      return 'Backlog'
  }
}

export function projectHealthLabel(health: string | null | undefined): string {
  switch (health) {
    case 'on_track':
      return 'On track'
    case 'at_risk':
      return 'At risk'
    case 'off_track':
      return 'Off track'
    case 'no_updates':
    default:
      return 'No updates'
  }
}

export function projectPriorityLabel(priority: number | null | undefined): string {
  return PROJECT_PRIORITIES.find((row) => row.value === priority)?.label ?? 'No priority'
}

export function formatProjectDate(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en-AU', { month: 'short', day: 'numeric' }).format(
      new Date(`${value}T00:00:00`)
    )
  } catch {
    return value
  }
}
