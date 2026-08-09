import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  FUNCTION_LIST_COLUMNS,
  PROJECT_LIST_COLUMNS,
  TASK_LIST_COLUMNS,
  TOP_TASK_LIMIT
} from '@/lib/list-columns'
import {
  computeFunctionStats,
  emptyFunctionStats,
  isOpenTaskStatus
} from '@/lib/function-stats'
import { computeProjectStats, emptyProjectStats } from '@/lib/project-stats'
import type {
  CompassBusinessFunction,
  CompassClient,
  CompassProject,
  CompassTask
} from '@/lib/types'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [functionRes, projectsRes, clientsRes, allTasksRes] = await Promise.all([
      supabase
        .from('compass_business_functions')
        .select(FUNCTION_LIST_COLUMNS)
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('compass_projects')
        .select(PROJECT_LIST_COLUMNS)
        .eq('business_function_id', id)
        .order('name'),
      supabase.from('compass_clients').select('id,name').is('archived_at', null),
      supabase
        .from('compass_tasks')
        .select(TASK_LIST_COLUMNS)
        .is('parent_task_id', null)
        .order('updated_at', { ascending: false })
        .limit(TOP_TASK_LIMIT * 3)
    ])

    if (functionRes.error || projectsRes.error || clientsRes.error || allTasksRes.error) {
      return portalJson({ error: 'fetch_failed' }, { status: 500 })
    }
    if (!functionRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const businessFunction = functionRes.data as CompassBusinessFunction
    const projectsRaw = (projectsRes.data ?? []) as CompassProject[]
    const projectIds = new Set(projectsRaw.map((project) => project.id))
    const clients = (clientsRes.data ?? []) as Pick<CompassClient, 'id' | 'name'>[]
    const clientNameById = Object.fromEntries(clients.map((client) => [client.id, client.name]))

    const relatedTasks = ((allTasksRes.data ?? []) as CompassTask[]).filter((task) => {
      if (task.business_function_id === id) return true
      if (task.project_id && projectIds.has(task.project_id)) return true
      return false
    })

    const taskStatsRes = relatedTasks.map((task) => ({
      project_id: task.project_id,
      status: task.status
    }))
    const statsByProject = computeProjectStats(taskStatsRes)

    const projects = projectsRaw.map((project) => ({
      ...project,
      labels: Array.isArray(project.labels) ? project.labels : [],
      priority: typeof project.priority === 'number' ? project.priority : 0,
      health: project.health || 'no_updates',
      client_name: project.client_id ? clientNameById[project.client_id] ?? null : null,
      stats: statsByProject.get(project.id) ?? emptyProjectStats()
    }))

    const functionStats =
      computeFunctionStats(
        projectsRaw.map((project) => ({
          id: project.id,
          business_function_id: project.business_function_id,
          status: project.status
        })),
        relatedTasks
      ).get(id) ?? emptyFunctionStats()

    const openTasks = relatedTasks.filter((task) => isOpenTaskStatus(task.status))
    const tasks = [...openTasks, ...relatedTasks.filter((task) => !isOpenTaskStatus(task.status))].slice(
      0,
      TOP_TASK_LIMIT
    )

    return portalJsonCached({
      function: { ...businessFunction, stats: functionStats },
      projects,
      tasks
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  let body: { name?: string; slug?: string; sort_order?: number }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    mirrored_at: new Date().toISOString()
  }
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
    patch.name = name
  }
  if (typeof body.slug === 'string') {
    const slug = body.slug.trim()
    if (!slug) return portalJson({ error: 'slug_required' }, { status: 400 })
    patch.slug = slug
  }
  if (typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) {
    patch.sort_order = body.sort_order
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_business_functions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson(data)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_business_functions')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({ ok: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
