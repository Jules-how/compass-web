import {
  forkSequence,
  isValidSequence,
  normalizeCopyStatus,
  normalizeTags,
  type OutboundCopyStatus,
  type OutboundCta,
  type OutboundExpression,
  type OutboundOpener,
  type OutboundOffer,
  type OutboundSequence,
  type OutboundStructure,
  type OutboundSubject,
  type OutboundTemplate
} from '@/lib/outbound-copy'
import {
  seedCtas,
  seedExpressions,
  seedOffers,
  seedOpeners,
  seedStructures,
  seedSubjects,
  seedTemplates
} from '@/lib/outbound-seed'

const STORAGE_KEY = 'compass.outbound.libraries.v1'

type LibraryStore = {
  seeded: boolean
  offers: OutboundOffer[]
  expressions: OutboundExpression[]
  structures: OutboundStructure[]
  ctas: OutboundCta[]
  subjects: OutboundSubject[]
  openers: OutboundOpener[]
  templates: OutboundTemplate[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function emptyStore(): LibraryStore {
  return {
    seeded: false,
    offers: [],
    expressions: [],
    structures: [],
    ctas: [],
    subjects: [],
    openers: [],
    templates: []
  }
}

function readRaw(): LibraryStore {
  if (typeof window === 'undefined') return emptyStore()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as LibraryStore
    return {
      seeded: Boolean(parsed.seeded),
      offers: Array.isArray(parsed.offers) ? parsed.offers : [],
      expressions: Array.isArray(parsed.expressions) ? parsed.expressions : [],
      structures: Array.isArray(parsed.structures) ? parsed.structures : [],
      ctas: Array.isArray(parsed.ctas) ? parsed.ctas : [],
      subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
      openers: Array.isArray(parsed.openers) ? parsed.openers : [],
      templates: Array.isArray(parsed.templates) ? parsed.templates : []
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: LibraryStore) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function ensureSeeded(): LibraryStore {
  const store = readRaw()
  if (store.seeded && store.offers.length > 0) return store
  const next: LibraryStore = {
    seeded: true,
    offers: seedOffers(),
    expressions: seedExpressions(),
    structures: seedStructures(),
    ctas: seedCtas(),
    subjects: seedSubjects(),
    openers: seedOpeners(),
    templates: seedTemplates()
  }
  writeStore(next)
  return next
}

function matchesFilters(
  row: { vertical_tags?: string[]; location_tags?: string[]; offer_key?: string | null; archived?: boolean },
  filters?: {
    offer_key?: string
    vertical?: string
    location?: string
    q?: string
    includeArchived?: boolean
  },
  searchText?: string
): boolean {
  if (!filters?.includeArchived && row.archived) return false
  if (filters?.offer_key && row.offer_key !== filters.offer_key) return false
  if (filters?.vertical && !(row.vertical_tags ?? []).includes(filters.vertical)) return false
  if (filters?.location && !(row.location_tags ?? []).includes(filters.location)) return false
  if (filters?.q?.trim()) {
    const q = filters.q.trim().toLowerCase()
    if (!(searchText ?? '').toLowerCase().includes(q)) return false
  }
  return true
}

export function listLocalOffers(filters?: Parameters<typeof matchesFilters>[1]): OutboundOffer[] {
  return ensureSeeded()
    .offers.filter((row) =>
      matchesFilters(row, filters, `${row.name} ${row.offer_key} ${row.pack_summary}`)
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

export function listLocalExpressions(
  filters?: Parameters<typeof matchesFilters>[1]
): OutboundExpression[] {
  return ensureSeeded()
    .expressions.filter((row) =>
      matchesFilters(row, filters, `${row.label} ${row.offer_key} ${row.body}`)
    )
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function listLocalStructures(
  filters?: Parameters<typeof matchesFilters>[1]
): OutboundStructure[] {
  return ensureSeeded()
    .structures.filter((row) => matchesFilters(row, filters, `${row.name} ${row.structure_id}`))
    .sort((a, b) => a.structure_id.localeCompare(b.structure_id))
}

export function listLocalCtas(filters?: Parameters<typeof matchesFilters>[1]): OutboundCta[] {
  return ensureSeeded()
    .ctas.filter((row) => matchesFilters(row, filters, `${row.label} ${row.body} ${row.cta_type}`))
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.label.localeCompare(b.label))
}

export function listLocalSubjects(
  filters?: Parameters<typeof matchesFilters>[1]
): OutboundSubject[] {
  return ensureSeeded()
    .subjects.filter((row) => matchesFilters(row, filters, `${row.label} ${row.pattern}`))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function listLocalOpeners(filters?: Parameters<typeof matchesFilters>[1]): OutboundOpener[] {
  return ensureSeeded()
    .openers.filter((row) =>
      matchesFilters(row, filters, `${row.label} ${row.opener_mode} ${row.body}`)
    )
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function listLocalTemplates(
  filters?: Parameters<typeof matchesFilters>[1]
): OutboundTemplate[] {
  return ensureSeeded()
    .templates.filter((row) =>
      matchesFilters(row, filters, `${row.name} ${row.offer_key ?? ''} ${row.structure_id}`)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getLocalOffer(id: string) {
  return ensureSeeded().offers.find((row) => row.id === id) ?? null
}
export function getLocalExpression(id: string) {
  return ensureSeeded().expressions.find((row) => row.id === id) ?? null
}
export function getLocalStructure(id: string) {
  return ensureSeeded().structures.find((row) => row.id === id) ?? null
}
export function getLocalCta(id: string) {
  return ensureSeeded().ctas.find((row) => row.id === id) ?? null
}
export function getLocalSubject(id: string) {
  return ensureSeeded().subjects.find((row) => row.id === id) ?? null
}
export function getLocalOpener(id: string) {
  return ensureSeeded().openers.find((row) => row.id === id) ?? null
}
export function getLocalTemplate(id: string) {
  return ensureSeeded().templates.find((row) => row.id === id) ?? null
}

export function getLocalStructureByKey(structureId: string) {
  return ensureSeeded().structures.find((row) => row.structure_id === structureId) ?? null
}

export function getLocalOfferByKey(offerKey: string) {
  return ensureSeeded().offers.find((row) => row.offer_key === offerKey) ?? null
}

function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  const idx = list.findIndex((item) => item.id === row.id)
  if (idx < 0) return [...list, row]
  const next = list.slice()
  next[idx] = row
  return next
}

export function saveLocalOffer(
  input: Partial<OutboundOffer> & { offer_key: string; name: string; pack_summary: string }
): OutboundOffer {
  const store = ensureSeeded()
  const stamp = nowIso()
  const row: OutboundOffer = {
    id: input.id || `offer-${crypto.randomUUID()}`,
    offer_key: input.offer_key.trim(),
    name: input.name.trim(),
    pack_summary: input.pack_summary.trim(),
    positioning_line: input.positioning_line?.trim() || null,
    vertical_tags: normalizeTags(input.vertical_tags),
    location_tags: normalizeTags(input.location_tags),
    sort_order: typeof input.sort_order === 'number' ? input.sort_order : 100,
    archived: Boolean(input.archived),
    created_at: input.created_at || stamp,
    updated_at: stamp
  }
  store.offers = upsert(store.offers, row)
  writeStore(store)
  return row
}

export function saveLocalExpression(
  input: Partial<OutboundExpression> & { offer_key: string; label: string; body: string }
): OutboundExpression {
  const store = ensureSeeded()
  const stamp = nowIso()
  const row: OutboundExpression = {
    id: input.id || `expr-${crypto.randomUUID()}`,
    offer_key: input.offer_key.trim(),
    label: input.label.trim(),
    body: input.body.trim(),
    vertical_tags: normalizeTags(input.vertical_tags),
    location_tags: normalizeTags(input.location_tags),
    status: input.status || 'draft',
    notes: input.notes?.trim() || null,
    archived: Boolean(input.archived),
    created_at: input.created_at || stamp,
    updated_at: stamp
  }
  store.expressions = upsert(store.expressions, row)
  writeStore(store)
  return row
}

export function saveLocalCta(
  input: Partial<OutboundCta> & { label: string; body: string; cta_type: string }
): OutboundCta {
  const store = ensureSeeded()
  const stamp = nowIso()
  const row: OutboundCta = {
    id: input.id || `cta-${crypto.randomUUID()}`,
    label: input.label.trim(),
    body: input.body.trim(),
    cta_type: input.cta_type,
    vertical_tags: normalizeTags(input.vertical_tags),
    location_tags: normalizeTags(input.location_tags),
    is_default: Boolean(input.is_default),
    archived: Boolean(input.archived),
    created_at: input.created_at || stamp,
    updated_at: stamp
  }
  store.ctas = upsert(store.ctas, row)
  writeStore(store)
  return row
}

export function saveLocalSubject(
  input: Partial<OutboundSubject> & { label: string; pattern: string }
): OutboundSubject {
  const store = ensureSeeded()
  const stamp = nowIso()
  const row: OutboundSubject = {
    id: input.id || `subj-${crypto.randomUUID()}`,
    label: input.label.trim(),
    pattern: input.pattern.trim(),
    notes: input.notes?.trim() || null,
    vertical_tags: normalizeTags(input.vertical_tags),
    archived: Boolean(input.archived),
    created_at: input.created_at || stamp,
    updated_at: stamp
  }
  store.subjects = upsert(store.subjects, row)
  writeStore(store)
  return row
}

export function saveLocalOpener(
  input: Partial<OutboundOpener> & { label: string; opener_mode: string; body: string }
): OutboundOpener {
  const store = ensureSeeded()
  const stamp = nowIso()
  const row: OutboundOpener = {
    id: input.id || `opener-${crypto.randomUUID()}`,
    label: input.label.trim(),
    opener_mode: input.opener_mode,
    body: input.body,
    notes: input.notes?.trim() || null,
    vertical_tags: normalizeTags(input.vertical_tags),
    archived: Boolean(input.archived),
    created_at: input.created_at || stamp,
    updated_at: stamp
  }
  store.openers = upsert(store.openers, row)
  writeStore(store)
  return row
}

export function saveLocalStructure(
  input: Partial<OutboundStructure> & { structure_id: string; name: string }
): OutboundStructure {
  const store = ensureSeeded()
  const stamp = nowIso()
  const slots = Array.isArray(input.slots)
    ? input.slots.map((slot) => ({
        key: String(slot.key ?? '').trim() || 'custom',
        label: String(slot.label ?? slot.key ?? 'Custom').trim() || 'Custom',
        required: Boolean(slot.required),
        body: typeof slot.body === 'string' ? slot.body : ''
      }))
    : []
  const row: OutboundStructure = {
    id: input.id || `struct-${crypto.randomUUID()}`,
    structure_id: input.structure_id.trim(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    slots,
    is_default_candidate: Boolean(input.is_default_candidate),
    archived: Boolean(input.archived),
    created_at: input.created_at || stamp,
    updated_at: stamp
  }
  store.structures = upsert(store.structures, row)
  writeStore(store)
  return row
}

export function saveLocalTemplate(
  input: Partial<OutboundTemplate> & { name: string; structure_id: string; sequence: OutboundSequence }
): OutboundTemplate {
  const store = ensureSeeded()
  if (!isValidSequence(input.sequence)) {
    throw new Error('invalid_sequence')
  }
  const stamp = nowIso()
  const row: OutboundTemplate = {
    id: input.id || `tmpl-${crypto.randomUUID()}`,
    name: input.name.trim(),
    offer_key: input.offer_key?.trim() || null,
    structure_id: input.structure_id,
    vertical_tags: normalizeTags(input.vertical_tags),
    location_tags: normalizeTags(input.location_tags),
    sequence: forkSequence(input.sequence, { remintStepIds: true }),
    archived: Boolean(input.archived),
    created_at: input.created_at || stamp,
    updated_at: stamp
  }
  store.templates = upsert(store.templates, row)
  writeStore(store)
  return row
}

export function archiveLocalLibraryItem(
  kind: 'offers' | 'expressions' | 'structures' | 'ctas' | 'subjects' | 'openers' | 'templates',
  id: string,
  archived = true
) {
  const store = ensureSeeded()
  const list = store[kind] as Array<{ id: string; archived: boolean; updated_at: string }>
  const idx = list.findIndex((row) => row.id === id)
  if (idx < 0) return null
  list[idx] = { ...list[idx], archived, updated_at: nowIso() }
  writeStore(store)
  return list[idx]
}

export function forkTemplateIntoSequence(templateId: string): OutboundSequence | null {
  const template = getLocalTemplate(templateId)
  if (!template) return null
  return forkSequence(template.sequence, {
    offer_key: template.offer_key,
    structure_id: template.structure_id,
    template_origin_id: template.id,
    remintStepIds: true
  })
}

export function normalizeCampaignCopyFields(input: {
  offer_key?: string | null
  structure_id?: string | null
  opener_mode?: string | null
  vertical_tags?: string[]
  location_tags?: string[]
  cold_expression?: string | null
  sequence_draft?: OutboundSequence | null
  copy_status?: string | null
  instantly_campaign_id?: string | null
}): {
  offer_key: string | null
  structure_id: string | null
  opener_mode: string | null
  vertical_tags: string[]
  location_tags: string[]
  cold_expression: string | null
  sequence_draft: OutboundSequence | null
  copy_status: OutboundCopyStatus
  instantly_campaign_id: string | null
} {
  const sequence =
    input.sequence_draft && isValidSequence(input.sequence_draft)
      ? input.sequence_draft
      : input.sequence_draft === null
        ? null
        : null
  return {
    offer_key: input.offer_key?.trim() || null,
    structure_id: input.structure_id?.trim() || null,
    opener_mode: input.opener_mode?.trim() || 'nick-tier',
    vertical_tags: normalizeTags(input.vertical_tags),
    location_tags: normalizeTags(input.location_tags),
    cold_expression: input.cold_expression?.trim() || null,
    sequence_draft: sequence,
    copy_status: normalizeCopyStatus(input.copy_status),
    instantly_campaign_id: input.instantly_campaign_id?.trim() || null
  }
}
