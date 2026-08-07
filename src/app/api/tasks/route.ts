import type { NextRequest } from 'next/server'
import type { CompassProject, CompassTask, CompassTaskInsert } from '@/lib/types'
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
  SUBTASK_LIMIT,
  TASK_LIST_COLUMNS,
  TOP_TASK_LIMIT
} from '@/lib/list-columns'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [topTasksRes, subtasksRes, projectsRes, bfsRes, clientsRes] = await Promise.all([
      supabase
        .from('compass_tasks')
        .select(TASK_LIST_COLUMNS)
        .is('parent_task_id', null)
        .order('updated_at', { ascending: false })
        .limit(TOP_TASK_LIMIT),
      supabase
        .from('compass_tasks')
        .select(TASK_LIST_COLUMNS)
        .not('parent_task_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(SUBTASK_LIMIT),
      supabase.from('compass_projects').select(PROJECT_LIST_COLUMNS).order('name'),
      supabase.from('compass_business_functions').select(FUNCTION_LIST_COLUMNS).order('sort_order'),
      supabase.from('compass_clients').select('id,name').is('archived_at', null)
    ])

    if (
      topTasksRes.error ||
      subtasksRes.error ||
      projectsRes.error ||
      bfsRes.error ||
      clientsRes.error
    ) {
      return portalJson({ error: 'fetch_failed' }, { status: 500 })
    }

    const clientNameById = Object.fromEntries(
      ((clientsRes.data ?? []) as Array<{ id: string; name: string }>).map((client) => [
        client.id,
        client.name
      ])
    )

    const topTasks = (topTasksRes.data ?? []) as CompassTask[]
    const parentIds = new Set(topTasks.map((task) => task.id))
    const subtasks = ((subtasksRes.data ?? []) as CompassTask[]).filter((task) =>
      task.parent_task_id ? parentIds.has(task.parent_task_id) : false
    )
    const projects = ((projectsRes.data ?? []) as CompassProject[]).map((project) => ({
      ...project,
      client_name: project.client_id ? clientNameById[project.client_id] ?? null : null
    }))

    return portalJsonCached({
      topTasks,
      subtasks,
      projects,
      businessFunctions: bfsRes.data ?? []
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  let body: Partial<CompassTaskInsert>
  try {
    body = (await readBoundedJson(request)) as Partial<CompassTaskInsert>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  if (!body.title || !body.title.trim()) {
    return portalJson({ error: 'title_required' }, { status: 400 })
  }

  const payload = {
    title: body.title.trim(),
    status: body.status ?? 'not-started',
    priority: body.priority ?? 0,
    due: body.due ?? null,
    source: body.source ?? 'compass-web',
    project_id: body.project_id ?? null,
    parent_task_id: body.parent_task_id ?? null,
    business_function_id: body.business_function_id ?? null,
    task_type: body.task_type ?? null,
    complexity: body.complexity ?? null,
    notes: body.notes ?? null
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase.rpc('portal_operator_create_task_mutation', {
      p_task: payload
    })
    if (error) {
      return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
    }
    const result = data as { task?: unknown } | null
    if (!result?.task) {
      return portalJson({ error: 'create_failed' }, { status: 400 })
    }
    return portalJson(result.task, { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
