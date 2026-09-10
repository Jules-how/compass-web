import type { CompassProject, CompassTask, LeadSummaryCounts } from '@/lib/types'

export const REPORT_DASHBOARDS = [
  { id: 'crm', title: 'CRM overview', description: 'Active records, outreach statuses and records needing attention.', reports: 2, icon: 'contacts' },
  { id: 'coverage', title: 'Contact coverage', description: 'Contact details, review queues and suppression in your lead ledger.', reports: 2, icon: 'coverage' },
  { id: 'work', title: 'Projects & recent tasks', description: 'Project statuses and the most recently updated tasks returned by Compass.', reports: 2, icon: 'work' },
] as const
export type ReportDashboardId = (typeof REPORT_DASHBOARDS)[number]['id']
export const REPORT_FAVORITES_KEY = 'compass.reports.favorites.v1'

export function isReportDashboardId(value: unknown): value is ReportDashboardId {
  return REPORT_DASHBOARDS.some((dashboard) => dashboard.id === value)
}

export function parseReportFavorites(raw: string | null): ReportDashboardId[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(value) ? [...new Set(value.filter(isReportDashboardId))] : []
  } catch { return [] }
}

/** Missing, malformed or negative API values remain unknown, never zero. */
export function reportCount(summary: Partial<LeadSummaryCounts> | null | undefined, key: keyof LeadSummaryCounts): number | null {
  const value = summary?.[key]
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export type ReportBar = { label: string; count: number | null; href?: string; tone?: 'violet' | 'green' | 'amber' | 'muted' }
export type WorkReportPayload = { topTasks: CompassTask[]; subtasks: CompassTask[]; projects: CompassProject[] }

export function isWorkReportPayload(value: unknown): value is WorkReportPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  return ['topTasks', 'subtasks', 'projects'].every((key) => Array.isArray(payload[key]) && (payload[key] as unknown[]).every((row) => row && typeof row === 'object' && typeof (row as Record<string, unknown>).id === 'string'))
}

function projectLane(status: unknown): string {
  if (status === 'active' || status === 'in_progress') return 'In progress'
  if (status === 'planned' || status === 'paused') return 'Planned'
  if (status === 'completed' || status === 'archived') return 'Completed'
  if (status === 'canceled' || status === 'cancelled') return 'Cancelled'
  if (status === 'backlog') return 'Backlog'
  return 'Unrecognised status'
}
function taskLane(status: unknown): string {
  if (status === 'not-started') return 'Todo'
  if (status === 'in-progress') return 'In progress'
  if (status === 'blocked') return 'Blocked'
  if (status === 'completed' || status === 'done') return 'Completed'
  if (status === 'cancelled') return 'Cancelled'
  return 'Unrecognised status'
}
function countLanes(rows: Array<{ status: unknown }>, lane: (value: unknown) => string, labels: string[]): ReportBar[] {
  const counts = new Map(labels.map((label) => [label, 0]))
  for (const row of rows) {
    const key = lane(row.status)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].map(([label, count]) => ({ label, count, tone: label === 'Completed' ? 'green' : label === 'Blocked' ? 'amber' : label === 'Cancelled' || label === 'Unrecognised status' ? 'muted' : 'violet' }))
}

export function summarizeWorkReport(data: WorkReportPayload, now = new Date()) {
  const tasks = [...new Map([...data.topTasks, ...data.subtasks].map((task) => [task.id, task])).values()]
  const projects = [...new Map(data.projects.map((project) => [project.id, project])).values()]
  const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' })
  const today = calendar.format(now)
  const dueDay = (value: string | null) => {
    if (!value || Number.isNaN(Date.parse(value))) return null
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : calendar.format(new Date(value))
  }
  const openTasks = tasks.filter((task) => ['Todo', 'In progress', 'Blocked'].includes(taskLane(task.status)))
  const overdue = openTasks.filter((task) => { const day = dueDay(task.due); return day != null && day < today })
  return {
    taskCount: tasks.length,
    projectCount: projects.length,
    openTaskCount: openTasks.length,
    overdueCount: overdue.length,
    taskBars: countLanes(tasks, taskLane, ['Todo', 'In progress', 'Blocked', 'Completed', 'Cancelled']),
    projectBars: countLanes(projects, projectLane, ['Backlog', 'Planned', 'In progress', 'Completed', 'Cancelled']),
    overdue: overdue.sort((a, b) => (a.due || '').localeCompare(b.due || '')).slice(0, 8),
    missingDue: openTasks.filter((task) => !task.due || Number.isNaN(Date.parse(task.due))).length,
  }
}
