import { forkSequence, type OutboundSequence, type OutboundTemplate } from '@/lib/outbound-copy'

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

export async function listLibraryItems<T>(
  kind: LibraryKind,
  filters?: LibraryFilters
): Promise<T[]> {
  const res = await fetch(`/api/outbound/${kind}${queryString(filters)}`, { cache: 'no-store' })
  const data = await readJson<{ items: T[] }>(res)
  return data.items ?? []
}

export async function getLibraryItem<T>(kind: LibraryKind, id: string): Promise<T> {
  const res = await fetch(`/api/outbound/${kind}/${encodeURIComponent(id)}`, { cache: 'no-store' })
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

/** Ensure seed rows exist in Supabase (no-op if already seeded). */
export async function ensureOutboundLibrarySeeded(): Promise<{ seeded: boolean; inserted: number }> {
  const res = await fetch('/api/outbound/seed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  })
  return readJson<{ seeded: boolean; inserted: number }>(res)
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
  }>('offers', { offer_key: offerKey })
  return items.find((row) => row.offer_key === offerKey) ?? items[0] ?? null
}
