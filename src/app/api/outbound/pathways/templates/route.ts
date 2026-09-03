import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { DEFAULT_OPENER_TEMPLATES } from '@/lib/pathway'
import { acceptTemplateProposal, ensureDefaultRecipe } from '@/lib/pathway-server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  let body: {
    recipeId?: string
    trade?: string
    label?: string
    field?: string
    op?: string
    value?: string
    structure?: string
    subject?: string
    style?: string
  }
  try {
    body = (await readBoundedJson(request, 16 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }
  const label = (body.label || '').trim()
  const structure = (body.structure || '').trim()
  if (!label || !structure) return portalJson({ error: 'label_structure_required' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    let recipeId = (body.recipeId || '').trim()
    if (!recipeId) {
      recipeId = await ensureDefaultRecipe(supabase, body.trade || 'hvac')
    }
    const { count } = await supabase
      .from('compass_opener_templates')
      .select('id', { count: 'exact', head: true })
      .eq('recipe_id', recipeId)
    const row = {
      id: `opener-${crypto.randomUUID()}`,
      recipe_id: recipeId,
      label,
      signal_when: {
        field: (body.field || 'paid_demand').trim(),
        op: body.op === 'eq' || body.op === 'contains' ? body.op : 'present',
        value: body.value?.trim() || undefined
      },
      structure,
      subject: (body.subject || DEFAULT_OPENER_TEMPLATES[0].subject).trim(),
      style: body.style?.trim() || null,
      sort_order: count ?? 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    const { data, error } = await supabase.from('compass_opener_templates').insert(row).select('*').single()
    if (error) throw new Error(error.message)
    return portalJson({ template: data })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    return portalJson({ error: 'template_create_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  let body: {
    id?: string
    pendingStructure?: string
    pendingSubject?: string
    structure?: string
    subject?: string
    label?: string
    accept?: boolean
  }
  try {
    body = (await readBoundedJson(request, 16 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }
  const id = (body.id || '').trim()
  if (!id) return portalJson({ error: 'id_required' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    if (body.accept) {
      const result = await acceptTemplateProposal(supabase, id)
      return portalJson({ ok: true, ...result })
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.pendingStructure !== undefined) patch.pending_structure = body.pendingStructure
    if (body.pendingSubject !== undefined) patch.pending_subject = body.pendingSubject
    if (body.structure !== undefined) patch.structure = body.structure
    if (body.subject !== undefined) patch.subject = body.subject
    if (body.label !== undefined) patch.label = body.label
    const { data, error } = await supabase
      .from('compass_opener_templates')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return portalJson({ template: data })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    const message = err instanceof Error ? err.message : 'template_update_failed'
    if (message === 'not_found') return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({ error: 'template_update_failed' }, { status: 500 })
  }
}
