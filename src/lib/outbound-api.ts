import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson
} from '@/lib/portal-http'
import { normalizeTags } from '@/lib/outbound-copy'

export type LibraryTable =
  | 'compass_outbound_offers'
  | 'compass_outbound_expressions'
  | 'compass_outbound_structures'
  | 'compass_outbound_ctas'
  | 'compass_outbound_subjects'
  | 'compass_outbound_openers'
  | 'compass_outbound_templates'

export function outboundNowIso() {
  return new Date().toISOString()
}

export function parseLibraryFilters(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  return {
    offer_key: sp.get('offer_key')?.trim() || undefined,
    vertical: sp.get('vertical')?.trim()?.toLowerCase() || undefined,
    location: sp.get('location')?.trim()?.toLowerCase() || undefined,
    q: sp.get('q')?.trim() || undefined,
    includeArchived: sp.get('archived') === '1'
  }
}

export function applyLibraryFilters<T extends {
  eq: (col: string, val: string) => T
  contains: (col: string, val: string[]) => T
  or: (expr: string) => T
  is: (col: string, val: boolean) => T
}>(query: T, filters: ReturnType<typeof parseLibraryFilters>, searchCols: string[]): T {
  let q = query
  if (!filters.includeArchived) q = q.eq('archived', 'false' as never) as T
  // archived is boolean — use filter via eq with boolean
  return q
}

/** Apply common filters on a post-fetched array (Supabase array contains varies by client). */
export function filterLibraryRows<T extends Record<string, unknown>>(
  rows: T[],
  filters: ReturnType<typeof parseLibraryFilters>,
  searchKeys: string[]
): T[] {
  return rows.filter((row) => {
    if (!filters.includeArchived && row.archived === true) return false
    if (filters.offer_key && row.offer_key !== filters.offer_key) return false
    const verticals = Array.isArray(row.vertical_tags) ? (row.vertical_tags as string[]) : []
    const locations = Array.isArray(row.location_tags) ? (row.location_tags as string[]) : []
    if (filters.vertical && !verticals.includes(filters.vertical)) return false
    if (filters.location && !locations.includes(filters.location)) return false
    if (filters.q) {
      const hay = searchKeys.map((k) => String(row[k] ?? '')).join(' ').toLowerCase()
      if (!hay.includes(filters.q.toLowerCase())) return false
    }
    return true
  })
}

export async function listLibrary(
  table: LibraryTable,
  request: NextRequest,
  searchKeys: string[],
  orderCol = 'updated_at'
) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const filters = parseLibraryFilters(request)
    const { data, error } = await supabase.from(table).select('*').order(orderCol, { ascending: false })
    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    const rows = filterLibraryRows((data ?? []) as Record<string, unknown>[], filters, searchKeys)
    return portalJsonCached({ items: rows })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function getLibraryItem(table: LibraryTable, id: string) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle()
    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJsonCached(data)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function createLibraryItem(
  request: NextRequest,
  table: LibraryTable,
  buildRow: (body: Record<string, unknown>, stamp: string) => Record<string, unknown> | { error: string; status?: number }
) {
  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }
  const stamp = outboundNowIso()
  const built = buildRow(body, stamp)
  if ('error' in built && typeof built.error === 'string' && !('id' in built)) {
    return portalJson({ error: built.error }, { status: (built as { status?: number }).status ?? 400 })
  }
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase.from(table).insert(built).select('*').single()
    if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
    return portalJson(data, { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}

export async function patchLibraryItem(
  request: NextRequest,
  table: LibraryTable,
  id: string,
  applyPatch: (
    body: Record<string, unknown>,
    existing: Record<string, unknown>,
    stamp: string
  ) => Record<string, unknown> | { error: string }
) {
  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const existingRes = await supabase.from(table).select('*').eq('id', id).maybeSingle()
    if (existingRes.error) {
      return portalJson({ error: 'fetch_failed', detail: existingRes.error.message }, { status: 500 })
    }
    if (!existingRes.data) return portalJson({ error: 'not_found' }, { status: 404 })
    const stamp = outboundNowIso()
    const patch = applyPatch(body, existingRes.data as Record<string, unknown>, stamp)
    if ('error' in patch && typeof patch.error === 'string' && Object.keys(patch).length <= 2) {
      return portalJson({ error: patch.error }, { status: 400 })
    }
    const { data, error } = await supabase.from(table).update(patch).eq('id', id).select('*').single()
    if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    return portalJson(data)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function archiveLibraryItem(_request: NextRequest, table: LibraryTable, id: string) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from(table)
      .update({ archived: true, updated_at: outboundNowIso() })
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson(data)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}

export function tagsFromBody(value: unknown) {
  return normalizeTags(value)
}
