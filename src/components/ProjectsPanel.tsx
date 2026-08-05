'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CompassBusinessFunction, CompassProjectWithStats } from '@/lib/types'
import { ProjectManager } from '@/components/ProjectManager'
import { LoadingBlock } from '@/components/LoadingBlock'

export function ProjectsPanel() {
  const [projects, setProjects] = useState<CompassProjectWithStats[] | null>(null)
  const [functions, setFunctions] = useState<CompassBusinessFunction[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/projects', { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`Failed to load projects (${res.status})`)
      const body = (await res.json()) as {
        projects: CompassProjectWithStats[]
        functions: CompassBusinessFunction[]
      }
      setProjects(body.projects ?? [])
      setFunctions(body.functions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}{' '}
        <button type="button" className="underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    )
  }

  if (!projects) return <LoadingBlock label="Loading projects…" />

  return <ProjectManager projects={projects} functions={functions} onRefresh={load} />
}
