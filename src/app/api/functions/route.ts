import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { FUNCTION_LIST_COLUMNS } from '@/lib/list-columns'
import { computeFunctionStats, emptyFunctionStats } from '@/lib/function-stats'
import type { CompassBusinessFunction, CompassProject, CompassTask } from '@/lib/types'

export const dynamic = 'force-dynamic'

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function nowIso(): string {
  return new Date().toISOString()
}

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [functionsRes, projectsRes, tasksRes] = await Promise.all([
      supabase.from('compass_business_functions').select(FUNCTION_LIST_COLUMNS).order('sort_order'),
      supabase.from('compass_projects').select('id,name,business_function_id,status').order('updated_at', {
        ascending: false
      }),
      supabase
        .from('compass_tasks')
        .select('id,business_function_id,project_id,status,parent_task_id')
        .is('parent_task_id', null)
    ])
    if (functionsRes.error || projectsRes.error || tasksRes.error) {
      return portalJson({ error: 'fetch_failed' }, { status: 500 })
    }

    const projects = (projectsRes.data ?? []) as Array<
      Pick<CompassProject, 'id' | 'name' | 'business_function_id' | 'status'>
    >

    const statsByFunction = computeFunctionStats(
      projects,
      (tasksRes.data ?? []) as Pick<
        CompassTask,
        'id' | 'business_function_id' | 'project_id' | 'status' | 'parent_task_id'
      >[]
    )

    const recentByFunction = new Map<string, Array<{ id: string; name: string }>>()
    for (const project of projects) {
      if (!project.business_function_id) continue
      const list = recentByFunction.get(project.business_function_id) ?? []
      if (list.length >= 3) continue
      list.push({ id: project.id, name: project.name })
      recentByFunction.set(project.business_function_id, list)
    }

    const functions = ((functionsRes.data ?? []) as CompassBusinessFunction[]).map((row) => ({
      ...row,
      stats: statsByFunction.get(row.id) ?? emptyFunctionStats(),
      recentProjects: recentByFunction.get(row.id) ?? []
    }))

    return portalJsonCached({ functions })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: { name?: string; slug?: string; sort_order?: number }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
  const slug = (body.slug?.trim() || slugify(name)).trim()
  if (!slug) return portalJson({ error: 'slug_required' }, { status: 400 })

  const stamp = nowIso()
  const row = {
    id: `bf-${crypto.randomUUID()}`,
    name,
    slug,
    sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
    created_at: stamp,
    updated_at: stamp,
    mirrored_at: stamp
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_business_functions')
      .insert(row)
      .select('*')
      .single()
    if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
    return portalJson(data, { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
