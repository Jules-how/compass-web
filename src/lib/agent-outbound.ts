import type { SupabaseClient } from '@supabase/supabase-js'

import {
  isValidSequence,
  normalizeCopyStatus,
  normalizeTags,
  type OutboundCopyStatus
} from '@/lib/outbound-copy'

export const OUTBOUND_KINDS = [
  'offers',
  'expressions',
  'structures',
  'ctas',
  'subjects',
  'openers',
  'templates'
] as const

export type OutboundKind = (typeof OUTBOUND_KINDS)[number]

export const OUTBOUND_KIND_TABLE = {
  offers: 'compass_outbound_offers',
  expressions: 'compass_outbound_expressions',
  structures: 'compass_outbound_structures',
  ctas: 'compass_outbound_ctas',
  subjects: 'compass_outbound_subjects',
  openers: 'compass_outbound_openers',
  templates: 'compass_outbound_templates'
} as const satisfies Record<OutboundKind, string>

export type LibraryTable = (typeof OUTBOUND_KIND_TABLE)[OutboundKind]

export const LIBRARY_BODY_MAX_BYTES = 64 * 1024
export const CAMPAIGN_COPY_BODY_MAX_BYTES = 256 * 1024
export const LIST_LIMIT_DEFAULT = 40
export const LIST_LIMIT_MAX = 100

const COMPACT_OMIT: Record<OutboundKind, string[]> = {
  offers: ['pack_summary'],
  expressions: ['body', 'notes'],
  structures: ['slots', 'description'],
  ctas: ['body'],
  subjects: ['notes'],
  openers: ['body', 'notes'],
  templates: ['sequence']
}

const SEARCH_KEYS: Record<OutboundKind, string[]> = {
  offers: ['name', 'offer_key', 'pack_summary'],
  expressions: ['label', 'offer_key', 'body', 'status', 'notes'],
  structures: ['name', 'structure_id', 'description'],
  ctas: ['label', 'body', 'cta_type'],
  subjects: ['label', 'pattern', 'notes'],
  openers: ['label', 'opener_mode', 'body', 'notes'],
  templates: ['name', 'offer_key', 'structure_id']
}

export type OutboundListQuery = {
  offer_key?: string
  vertical?: string
  location?: string
  q?: string
  includeArchived: boolean
  full: boolean
  limit: number
}

export function isOutboundKind(value: string): value is OutboundKind {
  return (OUTBOUND_KINDS as readonly string[]).includes(value)
}

export function clampListLimit(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return LIST_LIMIT_DEFAULT
  return Math.min(Math.floor(n), LIST_LIMIT_MAX)
}

export function parseOutboundListQuery(url: URL): OutboundListQuery {
  const sp = url.searchParams
  return {
    offer_key: sp.get('offer_key')?.trim() || undefined,
    vertical: sp.get('vertical')?.trim()?.toLowerCase() || undefined,
    location: sp.get('location')?.trim()?.toLowerCase() || undefined,
    q: sp.get('q')?.trim() || undefined,
    includeArchived: sp.get('archived') === '1',
    full: sp.get('full') === '1',
    limit: clampListLimit(sp.get('limit'))
  }
}

export function compactOutboundRow(
  kind: OutboundKind,
  row: Record<string, unknown>,
  full = false
): Record<string, unknown> {
  if (full) return { ...row }
  const omit = new Set(COMPACT_OMIT[kind])
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (omit.has(key)) continue
    out[key] = value
  }
  return out
}

export function filterOutboundRows(
  kind: OutboundKind,
  rows: Record<string, unknown>[],
  filters: OutboundListQuery
): Record<string, unknown>[] {
  const searchKeys = SEARCH_KEYS[kind]
  return rows.filter((row) => {
    if (!filters.includeArchived && row.archived === true) return false
    // Only exclude rows scoped to a different offer; unscoped library items stay visible.
    if (filters.offer_key) {
      const scoped = row.offer_key
      if (typeof scoped === 'string' && scoped && scoped !== filters.offer_key) return false
    }
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

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalStr(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string') return null
  return value.trim() || null
}

export type BuildResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string }

export function buildOutboundInsert(
  kind: OutboundKind,
  body: Record<string, unknown>,
  stamp: string
): BuildResult {
  switch (kind) {
    case 'offers': {
      const offer_key = str(body.offer_key)
      const name = str(body.name)
      const pack_summary = str(body.pack_summary)
      if (!offer_key || !name || !pack_summary) return { ok: false, error: 'fields_required' }
      return {
        ok: true,
        row: {
          id: `offer-${crypto.randomUUID()}`,
          offer_key,
          name,
          pack_summary,
          positioning_line: optionalStr(body.positioning_line),
          vertical_tags: normalizeTags(body.vertical_tags),
          location_tags: normalizeTags(body.location_tags),
          sort_order: typeof body.sort_order === 'number' ? body.sort_order : 100,
          archived: false,
          created_at: stamp,
          updated_at: stamp
        }
      }
    }
    case 'expressions': {
      const offer_key = str(body.offer_key)
      const label = str(body.label)
      const text = str(body.body)
      if (!offer_key || !label || !text) return { ok: false, error: 'fields_required' }
      return {
        ok: true,
        row: {
          id: `expr-${crypto.randomUUID()}`,
          offer_key,
          label,
          body: text,
          vertical_tags: normalizeTags(body.vertical_tags),
          location_tags: normalizeTags(body.location_tags),
          status: typeof body.status === 'string' ? body.status : 'draft',
          notes: optionalStr(body.notes),
          archived: false,
          created_at: stamp,
          updated_at: stamp
        }
      }
    }
    case 'structures': {
      const structure_id = str(body.structure_id)
      const name = str(body.name)
      if (!structure_id || !name) return { ok: false, error: 'fields_required' }
      return {
        ok: true,
        row: {
          id: `struct-${crypto.randomUUID()}`,
          structure_id,
          name,
          description: optionalStr(body.description),
          slots: Array.isArray(body.slots) ? body.slots : [],
          is_default_candidate: Boolean(body.is_default_candidate),
          archived: false,
          created_at: stamp,
          updated_at: stamp
        }
      }
    }
    case 'ctas': {
      const label = str(body.label)
      const text = str(body.body)
      if (!label || !text) return { ok: false, error: 'fields_required' }
      return {
        ok: true,
        row: {
          id: `cta-${crypto.randomUUID()}`,
          label,
          body: text,
          cta_type: typeof body.cta_type === 'string' ? body.cta_type : 'permission',
          vertical_tags: normalizeTags(body.vertical_tags),
          location_tags: normalizeTags(body.location_tags),
          is_default: Boolean(body.is_default),
          archived: false,
          created_at: stamp,
          updated_at: stamp
        }
      }
    }
    case 'subjects': {
      const label = str(body.label)
      const pattern = str(body.pattern)
      if (!label || !pattern) return { ok: false, error: 'fields_required' }
      return {
        ok: true,
        row: {
          id: `subj-${crypto.randomUUID()}`,
          label,
          pattern,
          notes: optionalStr(body.notes),
          vertical_tags: normalizeTags(body.vertical_tags),
          archived: false,
          created_at: stamp,
          updated_at: stamp
        }
      }
    }
    case 'openers': {
      const label = str(body.label)
      if (!label) return { ok: false, error: 'fields_required' }
      return {
        ok: true,
        row: {
          id: `opener-${crypto.randomUUID()}`,
          label,
          opener_mode: typeof body.opener_mode === 'string' ? body.opener_mode : 'custom',
          body: typeof body.body === 'string' ? body.body : '',
          notes: optionalStr(body.notes),
          vertical_tags: normalizeTags(body.vertical_tags),
          archived: false,
          created_at: stamp,
          updated_at: stamp
        }
      }
    }
    case 'templates': {
      const name = str(body.name)
      const structure_id = str(body.structure_id)
      if (!name || !structure_id) return { ok: false, error: 'fields_required' }
      if (!isValidSequence(body.sequence)) return { ok: false, error: 'invalid_sequence' }
      return {
        ok: true,
        row: {
          id: `tmpl-${crypto.randomUUID()}`,
          name,
          offer_key: optionalStr(body.offer_key),
          structure_id,
          vertical_tags: normalizeTags(body.vertical_tags),
          location_tags: normalizeTags(body.location_tags),
          sequence: body.sequence,
          archived: false,
          created_at: stamp,
          updated_at: stamp
        }
      }
    }
  }
}

export function buildOutboundPatch(
  kind: OutboundKind,
  body: Record<string, unknown>,
  stamp: string
): BuildResult {
  const patch: Record<string, unknown> = { updated_at: stamp }

  const setStr = (key: string, value: unknown) => {
    if (typeof value === 'string') patch[key] = value.trim()
  }

  switch (kind) {
    case 'offers':
      setStr('offer_key', body.offer_key)
      setStr('name', body.name)
      setStr('pack_summary', body.pack_summary)
      if (body.positioning_line !== undefined) patch.positioning_line = optionalStr(body.positioning_line)
      if (body.vertical_tags !== undefined) patch.vertical_tags = normalizeTags(body.vertical_tags)
      if (body.location_tags !== undefined) patch.location_tags = normalizeTags(body.location_tags)
      if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order
      if (typeof body.archived === 'boolean') patch.archived = body.archived
      break
    case 'expressions':
      setStr('offer_key', body.offer_key)
      setStr('label', body.label)
      setStr('body', body.body)
      if (typeof body.status === 'string') patch.status = body.status
      if (body.notes !== undefined) patch.notes = optionalStr(body.notes)
      if (body.vertical_tags !== undefined) patch.vertical_tags = normalizeTags(body.vertical_tags)
      if (body.location_tags !== undefined) patch.location_tags = normalizeTags(body.location_tags)
      if (typeof body.archived === 'boolean') patch.archived = body.archived
      break
    case 'structures':
      setStr('structure_id', body.structure_id)
      setStr('name', body.name)
      if (body.description !== undefined) patch.description = optionalStr(body.description)
      if (body.slots !== undefined) patch.slots = Array.isArray(body.slots) ? body.slots : []
      if (body.is_default_candidate !== undefined) {
        patch.is_default_candidate = Boolean(body.is_default_candidate)
      }
      if (typeof body.archived === 'boolean') patch.archived = body.archived
      break
    case 'ctas':
      setStr('label', body.label)
      setStr('body', body.body)
      if (typeof body.cta_type === 'string') patch.cta_type = body.cta_type
      if (body.vertical_tags !== undefined) patch.vertical_tags = normalizeTags(body.vertical_tags)
      if (body.location_tags !== undefined) patch.location_tags = normalizeTags(body.location_tags)
      if (body.is_default !== undefined) patch.is_default = Boolean(body.is_default)
      if (typeof body.archived === 'boolean') patch.archived = body.archived
      break
    case 'subjects':
      setStr('label', body.label)
      setStr('pattern', body.pattern)
      if (body.notes !== undefined) patch.notes = optionalStr(body.notes)
      if (body.vertical_tags !== undefined) patch.vertical_tags = normalizeTags(body.vertical_tags)
      if (typeof body.archived === 'boolean') patch.archived = body.archived
      break
    case 'openers':
      setStr('label', body.label)
      if (typeof body.opener_mode === 'string') patch.opener_mode = body.opener_mode
      if (typeof body.body === 'string') patch.body = body.body
      if (body.notes !== undefined) patch.notes = optionalStr(body.notes)
      if (body.vertical_tags !== undefined) patch.vertical_tags = normalizeTags(body.vertical_tags)
      if (typeof body.archived === 'boolean') patch.archived = body.archived
      break
    case 'templates':
      setStr('name', body.name)
      setStr('structure_id', body.structure_id)
      if (body.offer_key !== undefined) patch.offer_key = optionalStr(body.offer_key)
      if (body.vertical_tags !== undefined) patch.vertical_tags = normalizeTags(body.vertical_tags)
      if (body.location_tags !== undefined) patch.location_tags = normalizeTags(body.location_tags)
      if (body.sequence !== undefined) {
        if (!isValidSequence(body.sequence)) return { ok: false, error: 'invalid_sequence' }
        patch.sequence = body.sequence
      }
      if (typeof body.archived === 'boolean') patch.archived = body.archived
      break
  }

  return { ok: true, row: patch }
}

export type OutboundSummary = {
  counts: Record<OutboundKind, number>
  offerKeys: string[]
  updatedAt: Partial<Record<OutboundKind, string | null>>
}

export async function summarizeOutboundLibraries(admin: SupabaseClient): Promise<OutboundSummary> {
  const counts = Object.fromEntries(OUTBOUND_KINDS.map((k) => [k, 0])) as Record<OutboundKind, number>
  const updatedAt: Partial<Record<OutboundKind, string | null>> = {}
  const offerKeySet = new Set<string>()

  await Promise.all(
    OUTBOUND_KINDS.map(async (kind) => {
      const table = OUTBOUND_KIND_TABLE[kind]
      const { data, error } = await admin
        .from(table)
        .select('*')
        .eq('archived', false)
        .order('updated_at', { ascending: false })
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as Record<string, unknown>[]
      counts[kind] = rows.length
      updatedAt[kind] = typeof rows[0]?.updated_at === 'string' ? rows[0].updated_at : null
      for (const row of rows) {
        if (typeof row.offer_key === 'string' && row.offer_key) offerKeySet.add(row.offer_key)
      }
    })
  )

  return {
    counts,
    offerKeys: [...offerKeySet].sort(),
    updatedAt
  }
}

export function campaignCopyCompact(
  row: Record<string, unknown>,
  full = false
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    offer_key: row.offer_key ?? null,
    structure_id: row.structure_id ?? null,
    opener_mode: row.opener_mode ?? null,
    vertical_tags: row.vertical_tags ?? [],
    location_tags: row.location_tags ?? [],
    cold_expression: row.cold_expression ?? null,
    copy_status: row.copy_status ?? 'none',
    updated_at: row.updated_at ?? null
  }
  if (full) base.sequence_draft = row.sequence_draft ?? null
  return base
}

export function buildCampaignCopyPatch(
  body: Record<string, unknown>,
  stamp: string
): BuildResult {
  const patch: Record<string, unknown> = { updated_at: stamp }
  if (body.offer_key !== undefined) {
    patch.offer_key = typeof body.offer_key === 'string' ? body.offer_key.trim() || null : null
  }
  if (body.structure_id !== undefined) {
    patch.structure_id =
      typeof body.structure_id === 'string' ? body.structure_id.trim() || null : null
  }
  if (body.opener_mode !== undefined) {
    patch.opener_mode =
      typeof body.opener_mode === 'string' ? body.opener_mode.trim() || null : null
  }
  if (body.vertical_tags !== undefined) patch.vertical_tags = normalizeTags(body.vertical_tags)
  if (body.location_tags !== undefined) patch.location_tags = normalizeTags(body.location_tags)
  if (body.cold_expression !== undefined) {
    patch.cold_expression =
      typeof body.cold_expression === 'string' ? body.cold_expression.trim() || null : null
  }
  if (body.copy_status !== undefined) {
    patch.copy_status = normalizeCopyStatus(
      typeof body.copy_status === 'string' ? body.copy_status : null
    ) as OutboundCopyStatus
  }
  if (body.sequence_draft !== undefined) {
    if (body.sequence_draft === null) {
      patch.sequence_draft = null
    } else if (!isValidSequence(body.sequence_draft)) {
      return { ok: false, error: 'invalid_sequence' }
    } else {
      patch.sequence_draft = body.sequence_draft
    }
  }
  return { ok: true, row: patch }
}

export function wantsMinimalReturn(request: Request): boolean {
  const prefer = request.headers.get('prefer') || request.headers.get('Prefer') || ''
  return prefer.toLowerCase().includes('return=minimal')
}
