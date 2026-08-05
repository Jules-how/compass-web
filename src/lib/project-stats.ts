import type { TaskStatus } from '@/lib/types'

export interface ProjectTaskStatRow {
  project_id: string | null
  status: TaskStatus | string
}

export interface ProjectStats {
  issueCount: number
  completedCount: number
  percentComplete: number
}

export function emptyProjectStats(): ProjectStats {
  return { issueCount: 0, completedCount: 0, percentComplete: 0 }
}

export function computeProjectStats(rows: ProjectTaskStatRow[]): Map<string, ProjectStats> {
  const stats = new Map<string, ProjectStats>()
  for (const row of rows) {
    if (!row.project_id) continue
    const current = stats.get(row.project_id) ?? emptyProjectStats()
    current.issueCount += 1
    if (row.status === 'completed') current.completedCount += 1
    stats.set(row.project_id, current)
  }
  for (const value of stats.values()) {
    value.percentComplete =
      value.issueCount === 0 ? 0 : Math.round((value.completedCount / value.issueCount) * 100)
  }
  return stats
}

export function formatPercentComplete(percent: number): string {
  return `${percent}%`
}
