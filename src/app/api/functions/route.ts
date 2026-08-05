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
    const { data, error } = await supabase
      .from('compass_business_functions')
      .select(FUNCTION_LIST_COLUMNS)
      .order('sort_order')
    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    return portalJsonCached({ functions: data ?? [] })
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
