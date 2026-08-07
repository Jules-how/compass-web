import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { FUNCTION_LIST_COLUMNS, PROJECT_LIST_COLUMNS } from '@/lib/list-columns'
import { computeProjectStats, emptyProjectStats } from '@/lib/project-stats'
import { normalizeProjectStatus } from '@/lib/project-pm'
import type { CompassClient, CompassProject } from '@/lib/types'

export const dynamic = 'force-dynamic'

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 20)
}

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [projectsRes, functionsRes, taskStatsRes, clientsRes] = await Promise.all([
      supabase.from('compass_projects').select(PROJECT_LIST_COLUMNS).order('name'),
      supabase.from('compass_business_functions').select(FUNCTION_LIST_COLUMNS).order('sort_order'),
      supabase.from('compass_tasks').select('project_id,status').not('project_id', 'is', null),
      supabase.from('compass_clients').select('id,name').is('archived_at', null).order('name')
    ])
    if (projectsRes.error || functionsRes.error || taskStatsRes.error || clientsRes.error) {
      return portalJson({ error: 'fetch_failed' }, { status: 500 })
    }

    const clients = (clientsRes.data ?? []) as Pick<CompassClient, 'id' | 'name'>[]
    const clientNameById = Object.fromEntries(clients.map((client) => [client.id, client.name]))

    const statsByProject = computeProjectStats(taskStatsRes.data ?? [])
    const projects = ((projectsRes.data ?? []) as CompassProject[]).map((project) => ({
      ...project,
      labels: Array.isArray(project.labels) ? project.labels : [],
      priority: typeof project.priority === 'number' ? project.priority : 0,
      health: project.health || 'no_updates',
      client_name: project.client_id ? clientNameById[project.client_id] ?? null : null,
      stats: statsByProject.get(project.id) ?? emptyProjectStats()
    }))

    return portalJsonCached({
      projects,
      functions: functionsRes.data ?? [],
      clients
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: {
    name?: string
    status?: string
    priority?: number
    health?: string
    start_date?: string | null
    target_date?: string | null
    labels?: string[]
    summary?: string | null
    business_function_id?: string | null
    client_id?: string | null
    notes?: string | null
    milestones?: Array<{
      title?: string
      description?: string | null
      target_date?: string | null
    }>
    depends_on_project_ids?: string[]
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) return portalJson({ error: 'name_required' }, { status: 400 })

  const stamp = nowIso()
  const row = {
    id: `project-${crypto.randomUUID()}`,
    name,
    status: normalizeProjectStatus(body.status?.trim() || 'backlog'),
    priority: typeof body.priority === 'number' ? body.priority : 0,
    health: body.health?.trim() || 'no_updates',
    start_date: body.start_date || null,
    target_date: body.target_date || null,
    labels: normalizeLabels(body.labels),
    summary: body.summary?.trim() || null,
    business_function_id: body.business_function_id ?? null,
    client_id: body.client_id ?? null,
    source: 'compass-web',
    external_id: null,
    notes: body.notes ?? null,
    created_at: stamp,
    updated_at: stamp,
    mirrored_at: stamp
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase.from('compass_projects').insert(row).select('*').single()
    if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })

    const milestones = (body.milestones ?? [])
      .map((milestone, index) => {
        const title = milestone.title?.trim()
        if (!title) return null
        return {
          id: `milestone-${crypto.randomUUID()}`,
          project_id: row.id,
          title,
          description: milestone.description?.trim() || null,
          target_date: milestone.target_date || null,
          sort_order: index,
          completed: false,
          created_at: stamp,
          updated_at: stamp,
          mirrored_at: stamp
        }
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))

    if (milestones.length > 0) {
      const milestoneRes = await supabase.from('compass_project_milestones').insert(milestones)
      if (milestoneRes.error) {
        return portalJson(
          { error: 'create_failed', detail: milestoneRes.error.message },
          { status: 400 }
        )
      }
    }

    const dependsOn = (body.depends_on_project_ids ?? [])
      .filter((id): id is string => typeof id === 'string' && id.length > 0 && id !== row.id)
      .slice(0, 20)
      .map((depends_on_project_id) => ({
        project_id: row.id,
        depends_on_project_id,
        created_at: stamp
      }))
    if (dependsOn.length > 0) {
      const depRes = await supabase.from('compass_project_dependencies').insert(dependsOn)
      if (depRes.error) {
        return portalJson({ error: 'create_failed', detail: depRes.error.message }, { status: 400 })
      }
    }

    return portalJson({ ...data, stats: emptyProjectStats() }, { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
