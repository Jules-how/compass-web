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
  TASK_LIST_COLUMNS
} from '@/lib/list-columns'
import { computeProjectStats, emptyProjectStats } from '@/lib/project-stats'
import type { CompassBusinessFunction, CompassProject, CompassTask } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [projectRes, tasksRes, functionsRes] = await Promise.all([
      supabase.from('compass_projects').select(PROJECT_LIST_COLUMNS).eq('id', id).maybeSingle(),
      supabase
        .from('compass_tasks')
        .select(TASK_LIST_COLUMNS)
        .eq('project_id', id)
        .order('updated_at', { ascending: false }),
      supabase.from('compass_business_functions').select(FUNCTION_LIST_COLUMNS).order('sort_order')
    ])

    if (projectRes.error || tasksRes.error || functionsRes.error) {
      return portalJson({ error: 'fetch_failed' }, { status: 500 })
    }
    if (!projectRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const project = projectRes.data as CompassProject
    const tasks = (tasksRes.data ?? []) as CompassTask[]
    const stats = computeProjectStats(
      tasks.map((task) => ({ project_id: task.project_id, status: task.status }))
    ).get(project.id) ?? emptyProjectStats()

    const functions = (functionsRes.data ?? []) as CompassBusinessFunction[]
    const businessFunction =
      functions.find((fn) => fn.id === project.business_function_id) ?? null

    return portalJsonCached({
      project: { ...project, stats },
      tasks,
      businessFunction,
      functions
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  let body: {
    name?: string
    status?: string
    business_function_id?: string | null
    notes?: string | null
  }
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
  if (typeof body.status === 'string') patch.status = body.status.trim() || 'active'
  if (Object.prototype.hasOwnProperty.call(body, 'business_function_id')) {
    patch.business_function_id = body.business_function_id ?? null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    patch.notes = body.notes ?? null
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_projects')
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
      .from('compass_projects')
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
