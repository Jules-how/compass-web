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
import type { CompassProject } from '@/lib/types'

export const dynamic = 'force-dynamic'

function nowIso(): string {
  return new Date().toISOString()
}

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [projectsRes, functionsRes, taskStatsRes] = await Promise.all([
      supabase.from('compass_projects').select(PROJECT_LIST_COLUMNS).order('name'),
      supabase.from('compass_business_functions').select(FUNCTION_LIST_COLUMNS).order('sort_order'),
      supabase.from('compass_tasks').select('project_id,status').not('project_id', 'is', null)
    ])
    if (projectsRes.error || functionsRes.error || taskStatsRes.error) {
      return portalJson({ error: 'fetch_failed' }, { status: 500 })
    }

    const statsByProject = computeProjectStats(taskStatsRes.data ?? [])
    const projects = ((projectsRes.data ?? []) as CompassProject[]).map((project) => ({
      ...project,
      stats: statsByProject.get(project.id) ?? emptyProjectStats()
    }))

    return portalJsonCached({
      projects,
      functions: functionsRes.data ?? []
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
    business_function_id?: string | null
    notes?: string | null
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
    status: body.status?.trim() || 'active',
    business_function_id: body.business_function_id ?? null,
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
    return portalJson({ ...data, stats: emptyProjectStats() }, { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
