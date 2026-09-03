import { forkSequence, type OutboundSequence, type OutboundTemplate } from '@/lib/outbound-copy'
import { OUTBOUND_LIBRARY_SEED_VERSION } from '@/lib/outbound-library-seed-version'

export type LibraryKind =
  | 'offers'
  | 'expressions'
  | 'structures'
  | 'ctas'
  | 'subjects'
  | 'openers'
  | 'templates'

export type LibraryFilters = {
  offer_key?: string
  vertical?: string
  location?: string
  q?: string
  includeArchived?: boolean
}

export type LibraryBundle = {
  offers: unknown[]
  expressions: unknown[]
  structures: unknown[]
  ctas: unknown[]
  subjects: unknown[]
  openers: unknown[]
  templates: unknown[]
}

const SEED_SESSION_KEY = `compass.outbound.library.seeded.${OUTBOUND_LIBRARY_SEED_VERSION}`

let seedInFlight: Promise<{ seeded: boolean; inserted: number; skipped?: boolean }> | null = null

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string }
  if (!res.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : ''
    const err = typeof data.error === 'string' ? data.error : `http_${res.status}`
    throw new Error(detail ? `${err}: ${detail}` : err)
  }
  return data
}

function queryString(filters?: LibraryFilters): string {
  if (!filters) return ''
  const sp = new URLSearchParams()
  if (filters.offer_key) sp.set('offer_key', filters.offer_key)
  if (filters.vertical) sp.set('vertical', filters.vertical)
  if (filters.location) sp.set('location', filters.location)
  if (filters.q) sp.set('q', filters.q)
  if (filters.includeArchived) sp.set('archived', '1')
  const q = sp.toString()
  return q ? `?${q}` : ''
}

function markSeedComplete() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SEED_SESSION_KEY, '1')
    }
  } catch {
    /* private mode */
  }
}

function seedAlreadyComplete(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SEED_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export async function listLibraryItems<T>(
  kind: LibraryKind,
  filters?: LibraryFilters
): Promise<T[]> {
  const res = await fetch(`/api/outbound/${kind}${queryString(filters)}`, {
    headers: { Accept: 'application/json' }
  })
  const data = await readJson<{ items: T[] }>(res)
  return data.items ?? []
}

export async function listLibraryBundle<T extends LibraryBundle = LibraryBundle>(
  filters?: LibraryFilters
): Promise<T> {
  const res = await fetch(`/api/outbound/library${queryString(filters)}`, {
    headers: { Accept: 'application/json' }
  })
  const data = await readJson<Partial<T>>(res)
  return {
    offers: data.offers ?? [],
    expressions: data.expressions ?? [],
    structures: data.structures ?? [],
    ctas: data.ctas ?? [],
    subjects: data.subjects ?? [],
    openers: data.openers ?? [],
    templates: data.templates ?? []
  } as T
}

export async function getLibraryItem<T>(kind: LibraryKind, id: string): Promise<T> {
  const res = await fetch(`/api/outbound/${kind}/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' }
  })
  return readJson<T>(res)
}

export async function createLibraryItem<T>(kind: LibraryKind, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/outbound/${kind}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return readJson<T>(res)
}

export async function patchLibraryItem<T>(
  kind: LibraryKind,
  id: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`/api/outbound/${kind}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return readJson<T>(res)
}

export async function archiveLibraryItem(kind: LibraryKind, id: string): Promise<void> {
  const res = await fetch(`/api/outbound/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await readJson<{ ok?: boolean } | Record<string, unknown>>(res)
}

/**
 * Ensure seed rows exist in Supabase.
 * Skips the network call for the rest of the browser session once a seed
 * check succeeds for the current catalogue version.
 */
export async function ensureOutboundLibrarySeeded(options?: {
  force?: boolean
}): Promise<{ seeded: boolean; inserted: number; skipped?: boolean }> {
  if (!options?.force && seedAlreadyComplete()) {
    return { seeded: false, inserted: 0, skipped: true }
  }
  if (!options?.force && seedInFlight) return seedInFlight

  const run = (async () => {
    const res = await fetch('/api/outbound/seed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options?.force ? { force: true } : {})
    })
    const data = await readJson<{ seeded: boolean; inserted: number; skipped?: boolean }>(res)
    markSeedComplete()
    return data
  })()

  if (!options?.force) seedInFlight = run
  try {
    return await run
  } finally {
    if (seedInFlight === run) seedInFlight = null
  }
}

export async function forkTemplateIntoSequence(templateId: string): Promise<OutboundSequence | null> {
  const template = await getLibraryItem<OutboundTemplate>('templates', templateId)
  if (!template?.sequence) return null
  return forkSequence(template.sequence, { remintStepIds: true })
}

export async function getOfferByKey(offerKey: string) {
  const items = await listLibraryItems<{
    id: string
    offer_key: string
    name: string
    pack_summary: string
    vertical_tags?: string[]
    location_tags?: string[]
    guarantee?: string | null
  }>('offers', { offer_key: offerKey })
  return items.find((row) => row.offer_key === offerKey) ?? items[0] ?? null
}
