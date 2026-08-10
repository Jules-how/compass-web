/** Local Copy Archive store + list helpers for the Sequence Editor Archive tab. */

import type { CompassCampaign } from '@/lib/campaigns'
import {
  deriveCopyArchiveComponents,
  emptyCopyArchivePerformance,
  forkSequence,
  isValidSequence,
  normalizeTags,
  type CopyArchiveEntry,
  type CopyArchivePerformance,
  type CopyArchiveSortKey,
  type CopyArchiveSource,
  type OutboundSequence
} from '@/lib/outbound-copy'
import { getLocalOfferByKey, listLocalTemplates } from '@/lib/outbound-local-store'
import { seedCopyArchive } from '@/lib/outbound-seed'

const STORAGE_KEY = 'compass.outbound.copy-archive.v1'

type ArchiveStore = {
  seeded: boolean
  entries: CopyArchiveEntry[]
}

export type CopyArchiveListFilters = {
  q?: string
  vertical?: string
  location?: string
  offer_key?: string
  sort?: CopyArchiveSortKey
  includeArchived?: boolean
  /** When false, skip auto-derived template/campaign rows (saved archive only). Default true. */
  includeDerived?: boolean
  /** Pipeline campaigns from Supabase (used to derive archive rows). */
  pipelineCampaigns?: CompassCampaign[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function emptyStore(): ArchiveStore {
  return { seeded: false, entries: [] }
}

function readRaw(): ArchiveStore {
  if (typeof window === 'undefined') return emptyStore()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as ArchiveStore
    return {
      seeded: Boolean(parsed.seeded),
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: ArchiveStore) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function ensureSeeded(): ArchiveStore {
  const store = readRaw()
  if (store.seeded && store.entries.length > 0) return store
  const next: ArchiveStore = {
    seeded: true,
    entries: seedCopyArchive()
  }
  writeStore(next)
  return next
}

function normalizePerformance(value: unknown): CopyArchivePerformance {
  const base = emptyCopyArchivePerformance()
  if (!value || typeof value !== 'object') return base
  const v = value as Record<string, unknown>
  const num = (k: keyof CopyArchivePerformance) => {
    const n = Number(v[k])
    return Number.isFinite(n) ? n : base[k]
  }
  return {
    sendCount: num('sendCount'),
    replyCount: num('replyCount'),
    replyRate: num('replyRate'),
    positiveReplies: num('positiveReplies'),
    meetings: num('meetings'),
    leadCount: num('leadCount'),
    campaignCount: num('campaignCount')
  }
}

function normalizeEntry(row: Partial<CopyArchiveEntry> & { id: string; name: string; sequence: OutboundSequence }): CopyArchiveEntry {
  const offerKey =
    (typeof row.offer_key === 'string' ? row.offer_key : null) ?? row.sequence.offer_key ?? null
  const offer = offerKey ? getLocalOfferByKey(offerKey) : null
  const openerMode = typeof row.opener_mode === 'string' ? row.opener_mode : null
  const sequence = isValidSequence(row.sequence) ? row.sequence : forkSequence(row.sequence)
  return {
    id: row.id,
    name: row.name.trim() || 'Untitled copy',
    source: (row.source as CopyArchiveSource) || 'saved',
    source_id: row.source_id ?? null,
    vertical_tags: normalizeTags(row.vertical_tags),
    location_tags: normalizeTags(row.location_tags),
    offer_key: offerKey,
    structure_id: row.structure_id || sequence.structure_id || 'nick-3step',
    opener_mode: openerMode,
    sequence,
    components:
      row.components ??
      deriveCopyArchiveComponents(sequence, {
        offer_key: offerKey,
        offer_label: offer?.name ?? null,
        opener_mode: openerMode
      }),
    performance: normalizePerformance(row.performance),
    last_used_at: row.last_used_at ?? null,
    first_used_at: row.first_used_at ?? null,
    notes: row.notes?.trim() || null,
    archived: Boolean(row.archived),
    created_at: row.created_at || nowIso(),
    updated_at: row.updated_at || nowIso()
  }
}

function templateAsArchive(template: {
  id: string
  name: string
  offer_key: string | null
  structure_id: string
  vertical_tags: string[]
  location_tags: string[]
  sequence: OutboundSequence
  archived: boolean
  created_at: string
  updated_at: string
}): CopyArchiveEntry {
  const offer = template.offer_key ? getLocalOfferByKey(template.offer_key) : null
  return normalizeEntry({
    id: `derived-tmpl-${template.id}`,
    name: template.name,
    source: 'template',
    source_id: template.id,
    vertical_tags: template.vertical_tags,
    location_tags: template.location_tags,
    offer_key: template.offer_key,
    structure_id: template.structure_id,
    opener_mode: null,
    sequence: forkSequence(template.sequence, { remintStepIds: true }),
    performance: emptyCopyArchivePerformance(),
    last_used_at: null,
    first_used_at: null,
    notes: 'Library template',
    archived: template.archived,
    created_at: template.created_at,
    updated_at: template.updated_at
  })
}

function campaignAsArchive(campaign: {
  id: string
  name: string
  offer_key?: string | null
  structure_id?: string | null
  opener_mode?: string | null
  vertical_tags?: string[]
  location_tags?: string[]
  sequence_draft?: OutboundSequence | null
  cold_expression?: string | null
  updated_at: string
  created_at: string
}): CopyArchiveEntry | null {
  if (!campaign.sequence_draft || !isValidSequence(campaign.sequence_draft)) return null
  const seq = forkSequence(campaign.sequence_draft, { remintStepIds: true })
  return normalizeEntry({
    id: `derived-campaign-${campaign.id}`,
    name: campaign.name,
    source: 'campaign',
    source_id: campaign.id,
    vertical_tags: campaign.vertical_tags ?? [],
    location_tags: campaign.location_tags ?? [],
    offer_key: campaign.offer_key ?? seq.offer_key ?? null,
    structure_id: campaign.structure_id || seq.structure_id,
    opener_mode: campaign.opener_mode ?? null,
    sequence: seq,
    performance: emptyCopyArchivePerformance(),
    last_used_at: campaign.updated_at,
    first_used_at: campaign.created_at,
    notes: campaign.cold_expression ? 'Campaign sequence draft' : 'Campaign draft',
    archived: false,
    created_at: campaign.created_at,
    updated_at: campaign.updated_at
  })
}

function matchesFilters(entry: CopyArchiveEntry, filters?: CopyArchiveListFilters): boolean {
  if (!filters) return !entry.archived
  if (!filters.includeArchived && entry.archived) return false
  if (filters.vertical && !entry.vertical_tags.includes(filters.vertical)) return false
  if (filters.location && !entry.location_tags.includes(filters.location)) return false
  if (filters.offer_key && entry.offer_key !== filters.offer_key) return false
  if (filters.q) {
    const q = filters.q.toLowerCase()
    const hay = [
      entry.name,
      entry.offer_key ?? '',
      entry.structure_id,
      entry.notes ?? '',
      entry.components.subject ?? '',
      entry.components.expression_preview ?? '',
      entry.vertical_tags.join(' '),
      entry.location_tags.join(' ')
    ]
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

function sortEntries(list: CopyArchiveEntry[], sort: CopyArchiveSortKey = 'reply'): CopyArchiveEntry[] {
  const next = list.slice()
  next.sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'sent':
        return b.performance.sendCount - a.performance.sendCount
      case 'last_used': {
        const au = a.last_used_at || ''
        const bu = b.last_used_at || ''
        return bu.localeCompare(au) || b.performance.replyRate - a.performance.replyRate
      }
      case 'reply':
      default:
        return (
          b.performance.replyRate - a.performance.replyRate ||
          b.performance.sendCount - a.performance.sendCount ||
          a.name.localeCompare(b.name)
        )
    }
  })
  return next
}

/** Saved archive rows (seed + operator saves). */
export function listSavedCopyArchive(includeArchived = false): CopyArchiveEntry[] {
  return ensureSeeded()
    .entries.filter((row) => includeArchived || !row.archived)
    .map((row) => normalizeEntry(row))
}

/**
 * Full Archive list for the editor: saved rows, plus library templates and
 * local campaign drafts that aren't already represented by a saved entry.
 */
export function listCopyArchive(filters?: CopyArchiveListFilters): CopyArchiveEntry[] {
  const saved = listSavedCopyArchive(Boolean(filters?.includeArchived))
  const claimedSources = new Set<string>()
  for (const row of saved) {
    if (row.source_id) claimedSources.add(`${row.source}:${row.source_id}`)
  }

  const derived: CopyArchiveEntry[] = []

  if (filters?.includeDerived !== false) {
    for (const tmpl of listLocalTemplates({ includeArchived: false })) {
      if (claimedSources.has(`template:${tmpl.id}`)) continue
      const email = tmpl.sequence.steps[0]
      const hasCopy =
        Boolean(email?.subject.trim()) ||
        (email?.slots ?? []).some(
          (s) =>
            s.key !== 'accountSignature' &&
            s.key !== 'spam_act_opt_out' &&
            s.body.trim() &&
            !s.body.includes('{{cold_expression}}') &&
            !s.body.includes('{{proof}}')
        )
      if (!hasCopy && !tmpl.offer_key) continue
      derived.push(templateAsArchive(tmpl))
    }

    for (const campaign of filters?.pipelineCampaigns ?? []) {
      if (claimedSources.has(`campaign:${campaign.id}`)) continue
      if (!campaign.sequence_draft || campaign.copy_status === 'none') continue
      const row = campaignAsArchive(campaign)
      if (row) derived.push(row)
    }
  }

  return sortEntries(
    [...saved, ...derived].filter((row) => matchesFilters(row, filters)),
    filters?.sort ?? 'reply'
  )
}

export function getCopyArchiveEntry(id: string): CopyArchiveEntry | null {
  const saved = ensureSeeded().entries.find((row) => row.id === id)
  if (saved) return normalizeEntry(saved)
  return listCopyArchive({ includeArchived: true }).find((row) => row.id === id) ?? null
}

export function saveCopyArchiveEntry(
  input: Partial<CopyArchiveEntry> & {
    name: string
    sequence: OutboundSequence
  }
): CopyArchiveEntry {
  const store = ensureSeeded()
  const stamp = nowIso()
  const existing = input.id ? store.entries.find((row) => row.id === input.id) : null
  const offerKey = input.offer_key ?? input.sequence.offer_key ?? existing?.offer_key ?? null
  const offer = offerKey ? getLocalOfferByKey(offerKey) : null
  const openerMode = input.opener_mode ?? existing?.opener_mode ?? null
  const sequence = forkSequence(input.sequence, {
    remintStepIds: !existing,
    offer_key: offerKey,
    template_origin_id: input.sequence.template_origin_id ?? null
  })
  const row = normalizeEntry({
    id: input.id || `archive-${crypto.randomUUID()}`,
    name: input.name,
    source: input.source || existing?.source || 'saved',
    source_id: input.source_id ?? existing?.source_id ?? null,
    vertical_tags: input.vertical_tags ?? existing?.vertical_tags ?? [],
    location_tags: input.location_tags ?? existing?.location_tags ?? [],
    offer_key: offerKey,
    structure_id: input.structure_id || sequence.structure_id,
    opener_mode: openerMode,
    sequence,
    components: deriveCopyArchiveComponents(sequence, {
      offer_key: offerKey,
      offer_label: offer?.name ?? null,
      opener_mode: openerMode
    }),
    performance: input.performance
      ? normalizePerformance(input.performance)
      : existing?.performance ?? emptyCopyArchivePerformance(),
    last_used_at: input.last_used_at !== undefined ? input.last_used_at : existing?.last_used_at ?? null,
    first_used_at:
      input.first_used_at !== undefined
        ? input.first_used_at
        : existing?.first_used_at ?? stamp,
    notes: input.notes !== undefined ? input.notes : existing?.notes ?? null,
    archived: input.archived ?? existing?.archived ?? false,
    created_at: existing?.created_at || stamp,
    updated_at: stamp
  })

  const idx = store.entries.findIndex((item) => item.id === row.id)
  if (idx < 0) store.entries = [...store.entries, row]
  else {
    const next = store.entries.slice()
    next[idx] = row
    store.entries = next
  }
  writeStore(store)
  return row
}

export function touchCopyArchiveLastUsed(id: string): CopyArchiveEntry | null {
  const store = ensureSeeded()
  const idx = store.entries.findIndex((row) => row.id === id)
  const stamp = nowIso()

  if (idx >= 0) {
    const prev = store.entries[idx]
    const next = normalizeEntry({
      ...prev,
      last_used_at: stamp,
      first_used_at: prev.first_used_at || stamp,
      updated_at: stamp,
      performance: {
        ...normalizePerformance(prev.performance),
        campaignCount: Math.max(1, normalizePerformance(prev.performance).campaignCount)
      }
    })
    const list = store.entries.slice()
    list[idx] = next
    store.entries = list
    writeStore(store)
    return next
  }

  // Derived template/campaign — promote into saved archive on first use
  const derived = getCopyArchiveEntry(id)
  if (!derived) return null
  return saveCopyArchiveEntry({
    ...derived,
    id: derived.id.startsWith('derived-')
      ? `archive-${crypto.randomUUID()}`
      : derived.id,
    source: 'saved',
    source_id: derived.source_id,
    last_used_at: stamp,
    first_used_at: derived.first_used_at || stamp
  })
}

export function archiveCopyArchiveEntry(id: string): boolean {
  const store = ensureSeeded()
  const idx = store.entries.findIndex((row) => row.id === id)
  if (idx < 0) return false
  const list = store.entries.slice()
  list[idx] = { ...list[idx], archived: true, updated_at: nowIso() }
  store.entries = list
  writeStore(store)
  return true
}

/** Fork sequence for editor reuse; bumps last_used when the row is saved. */
export function forkCopyArchiveIntoSequence(id: string): OutboundSequence | null {
  const entry = getCopyArchiveEntry(id)
  if (!entry) return null
  if (!entry.id.startsWith('derived-')) {
    touchCopyArchiveLastUsed(id)
  } else {
    touchCopyArchiveLastUsed(id)
  }
  return forkSequence(entry.sequence, {
    remintStepIds: true,
    offer_key: entry.offer_key,
    template_origin_id: entry.source === 'template' ? entry.source_id : entry.sequence.template_origin_id
  })
}
