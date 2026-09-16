/** Small session cache; drafts remain owned by their per-contact storage key. */
export function createCallingDetailCache<T extends { lead: { id: string } }>(capacity = 8, ttlMs = 30_000) {
  const entries = new Map<string, { value: T; at: number }>()
  return {
    get(id: string, now = Date.now()): T | null {
      const entry = entries.get(id)
      if (!entry || now - entry.at >= ttlMs) { entries.delete(id); return null }
      entries.delete(id); entries.set(id, entry)
      return entry.value
    },
    set(id: string, value: T, now = Date.now()) {
      if (value.lead.id !== id) throw new Error('Calling detail identity does not match the requested contact.')
      entries.delete(id); entries.set(id, { value, at: now })
      while (entries.size > capacity) entries.delete(entries.keys().next().value!)
      return value
    },
    clear() { entries.clear() },
  }
}
