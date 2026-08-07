'use client'

import type { CompassBusinessFunction, CompassProjectWithStats } from '@/lib/types'
import { ProjectManager } from '@/components/ProjectManager'
import { LoadingBlock } from '@/components/LoadingBlock'
import { useCachedJson } from '@/lib/use-cached-json'

type ProjectsPayload = {
  projects: CompassProjectWithStats[]
  functions: CompassBusinessFunction[]
  clients?: Array<{ id: string; name: string }>
}

export function ProjectsPanel() {
  const { data, error, loading, reload } = useCachedJson<ProjectsPayload>(
    '/api/projects',
    '/api/projects'
  )

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}{' '}
        <button type="button" className="underline" onClick={() => void reload(true)}>
          Retry
        </button>
      </div>
    )
  }

  if (loading || !data) return <LoadingBlock label="Loading projects…" />

  return (
    <ProjectManager
      projects={data.projects ?? []}
      functions={data.functions ?? []}
      clients={data.clients ?? []}
      onRefresh={async () => {
        await reload(true)
      }}
    />
  )
}
