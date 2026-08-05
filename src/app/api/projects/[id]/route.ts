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
  PROJECT_MILESTONE_COLUMNS,
  PROJECT_UPDATE_COLUMNS,
  TASK_LIST_COLUMNS
} from '@/lib/list-columns'
import { computeProjectStats, emptyProjectStats } from '@/lib/project-stats'
import { normalizeProjectStatus } from '@/lib/project-pm'
import type {
  CompassBusinessFunction,
  CompassProject,
  CompassProjectDependency,
  CompassProjectMilestone,
  CompassProjectUpdate,
  CompassTask
} from '@/lib/types'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

function normalizeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 20)
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [projectRes, tasksRes, functionsRes, milestonesRes, updatesRes, depsRes] =
      await Promise.all([
        supabase.from('compass_projects').select(PROJECT_LIST_COLUMNS).eq('id', id).maybeSingle(),
        supabase
          .from('compass_tasks')
          .select(TASK_LIST_COLUMNS)
          .eq('project_id', id)
          .order('updated_at', { ascending: false }),
        supabase.from('compass_business_functions').select(FUNCTION_LIST_COLUMNS).order('sort_order'),
        supabase
          .from('compass_project_milestones')
          .select(PROJECT_MILESTONE_COLUMNS)
          .eq('project_id', id)
          .order('sort_order'),
        supabase
          .from('compass_project_updates')
          .select(PROJECT_UPDATE_COLUMNS)
          .eq('project_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('compass_project_dependencies')
          .select('project_id,depends_on_project_id,created_at')
          .eq('project_id', id)
      ])

    if (
      projectRes.error ||
      tasksRes.error ||
      functionsRes.error ||
      milestonesRes.error ||
      updatesRes.error ||
      depsRes.error
    ) {
      return portalJson({ error: 'fetch_failed' }, { status: 500 })
    }
    if (!projectRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const project = projectRes.data as CompassProject
    const tasks = (tasksRes.data ?? []) as CompassTask[]
    const stats =
      computeProjectStats(
        tasks.map((task) => ({ project_id: task.project_id, status: task.status }))
      ).get(project.id) ?? emptyProjectStats()

    const functions = (functionsRes.data ?? []) as CompassBusinessFunction[]
    const businessFunction =
      functions.find((fn) => fn.id === project.business_function_id) ?? null

    return portalJsonCached({
      project: {
        ...project,
        labels: Array.isArray(project.labels) ? project.labels : [],
        priority: typeof project.priority === 'number' ? project.priority : 0,
        health: project.health || 'no_updates',
        stats
      },
      tasks,
      businessFunction,
      functions,
      milestones: (milestonesRes.data ?? []) as CompassProjectMilestone[],
      updates: (updatesRes.data ?? []) as CompassProjectUpdate[],
      dependencies: (depsRes.data ?? []) as CompassProjectDependency[]
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
    priority?: number
    health?: string
    start_date?: string | null
    target_date?: string | null
    labels?: string[]
    summary?: string | null
    business_function_id?: string | null
    notes?: string | null
    milestones?: Array<{
      id?: string
      title?: string
      description?: string | null
      target_date?: string | null
      completed?: boolean
      sort_order?: number
    }>
    depends_on_project_ids?: string[]
    update?: { body?: string; health?: string }
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const stamp = new Date().toISOString()
  const patch: Record<string, unknown> = {
    updated_at: stamp,
    mirrored_at: stamp
  }
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
    patch.name = name
  }
  if (typeof body.status === 'string') patch.status = normalizeProjectStatus(body.status)
  if (typeof body.priority === 'number') patch.priority = body.priority
  if (typeof body.health === 'string') patch.health = body.health.trim() || 'no_updates'
  if (Object.prototype.hasOwnProperty.call(body, 'start_date')) {
    patch.start_date = body.start_date || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'target_date')) {
    patch.target_date = body.target_date || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'labels')) {
    patch.labels = normalizeLabels(body.labels)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'summary')) {
    patch.summary = body.summary?.trim() || null
  }
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

    if (Array.isArray(body.milestones)) {
      await supabase.from('compass_project_milestones').delete().eq('project_id', id)
      const milestones = body.milestones
        .map((milestone, index) => {
          const title = milestone.title?.trim()
          if (!title) return null
          return {
            id: milestone.id?.trim() || `milestone-${crypto.randomUUID()}`,
            project_id: id,
            title,
            description: milestone.description?.trim() || null,
            target_date: milestone.target_date || null,
            sort_order: typeof milestone.sort_order === 'number' ? milestone.sort_order : index,
            completed: Boolean(milestone.completed),
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
            { error: 'update_failed', detail: milestoneRes.error.message },
            { status: 400 }
          )
        }
      }
    }

    if (Array.isArray(body.depends_on_project_ids)) {
      await supabase.from('compass_project_dependencies').delete().eq('project_id', id)
      const dependsOn = body.depends_on_project_ids
        .filter((depId): depId is string => typeof depId === 'string' && depId.length > 0 && depId !== id)
        .slice(0, 20)
        .map((depends_on_project_id) => ({
          project_id: id,
          depends_on_project_id,
          created_at: stamp
        }))
      if (dependsOn.length > 0) {
        const depRes = await supabase.from('compass_project_dependencies').insert(dependsOn)
        if (depRes.error) {
          return portalJson({ error: 'update_failed', detail: depRes.error.message }, { status: 400 })
        }
      }
    }

    if (body.update?.body?.trim()) {
      const updateRow = {
        id: `update-${crypto.randomUUID()}`,
        project_id: id,
        health: body.update.health?.trim() || (typeof body.health === 'string' ? body.health : 'no_updates'),
        body: body.update.body.trim(),
        created_at: stamp,
        mirrored_at: stamp
      }
      const updateRes = await supabase.from('compass_project_updates').insert(updateRow)
      if (updateRes.error) {
        return portalJson({ error: 'update_failed', detail: updateRes.error.message }, { status: 400 })
      }
      if (!body.health && updateRow.health) {
        await supabase
          .from('compass_projects')
          .update({ health: updateRow.health, updated_at: stamp, mirrored_at: stamp })
          .eq('id', id)
      }
    }

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
