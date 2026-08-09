import { peekQueryCache, writeQueryCache } from '@/lib/query-cache'
import type { CompassBusinessFunction, CompassProjectWithStats } from '@/lib/types'

export const PROJECTS_CACHE_KEY = '/api/projects'

export type ProjectsPayload = {
  projects: CompassProjectWithStats[]
  functions: CompassBusinessFunction[]
  clients?: Array<{ id: string; name: string }>
}

/** Insert or replace a project in the shared projects list cache (immediate UI). */
export function upsertCachedProject(project: CompassProjectWithStats) {
  const existing = peekQueryCache<ProjectsPayload>(PROJECTS_CACHE_KEY)
  if (!existing?.data) return

  const projects = existing.data.projects ?? []
  const index = projects.findIndex((row) => row.id === project.id)
  const nextProjects =
    index >= 0
      ? projects.map((row, i) => (i === index ? { ...row, ...project } : row))
      : [...projects, project]

  writeQueryCache<ProjectsPayload>(PROJECTS_CACHE_KEY, {
    ...existing.data,
    projects: nextProjects
  })
}

/** Swap a temporary optimistic row for the server-created project. */
export function replaceCachedProject(tempId: string, project: CompassProjectWithStats) {
  const existing = peekQueryCache<ProjectsPayload>(PROJECTS_CACHE_KEY)
  if (!existing?.data) return

  const projects = existing.data.projects ?? []
  const withoutTemp = projects.filter((row) => row.id !== tempId)
  const index = withoutTemp.findIndex((row) => row.id === project.id)
  const nextProjects =
    index >= 0
      ? withoutTemp.map((row, i) => (i === index ? { ...row, ...project } : row))
      : [...withoutTemp, project]

  writeQueryCache<ProjectsPayload>(PROJECTS_CACHE_KEY, {
    ...existing.data,
    projects: nextProjects
  })
}

export function removeCachedProject(projectId: string) {
  const existing = peekQueryCache<ProjectsPayload>(PROJECTS_CACHE_KEY)
  if (!existing?.data) return

  writeQueryCache<ProjectsPayload>(PROJECTS_CACHE_KEY, {
    ...existing.data,
    projects: (existing.data.projects ?? []).filter((row) => row.id !== projectId)
  })
}
