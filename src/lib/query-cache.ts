type CacheEntry<T> = {
  data: T
  error: string | null
  updatedAt: number
  promise?: Promise<void>
}

const store = new Map<string, CacheEntry<unknown>>()
const listeners = new Map<string, Set<() => void>>()
/** Bumped on each load start and each local write so older in-flight loaders cannot clobber newer data. */
const generations = new Map<string, number>()

const SESSION_KEYS = new Set(['/api/campaigns'])
const SESSION_PREFIX = 'compass.qc.v1:'

function persistWrite(key: string, data: unknown, updatedAt: number) {
  if (typeof window === 'undefined' || !SESSION_KEYS.has(key)) return
  try {
    window.sessionStorage.setItem(
      SESSION_PREFIX + key,
      JSON.stringify({ data, updatedAt })
    )
  } catch {
    /* quota / private mode */
  }
}

function persistRead<T>(key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined' || !SESSION_KEYS.has(key)) return null
  try {
    const raw = window.sessionStorage.getItem(SESSION_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data?: T; updatedAt?: number }
    if (parsed?.data === undefined) return null
    return {
      data: parsed.data,
      error: null,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
    }
  } catch {
    return null
  }
}

function emit(key: string) {
  const set = listeners.get(key)
  if (!set) return
  for (const listener of set) listener()
}

function bumpGeneration(key: string): number {
  const next = (generations.get(key) ?? 0) + 1
  generations.set(key, next)
  return next
}

export function subscribeQueryCache(key: string, listener: () => void) {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(listener)
  return () => {
    set!.delete(listener)
    if (set!.size === 0) listeners.delete(key)
  }
}

export function peekQueryCache<T>(key: string): CacheEntry<T> | null {
  const mem = store.get(key) as CacheEntry<T> | undefined
  if (mem) return mem
  const disk = persistRead<T>(key)
  if (!disk) return null
  store.set(key, disk)
  return disk
}

export function writeQueryCache<T>(key: string, data: T) {
  bumpGeneration(key)
  const updatedAt = Date.now()
  store.set(key, { data, error: null, updatedAt })
  persistWrite(key, data, updatedAt)
  emit(key)
}

export async function loadQueryCache<T>(
  key: string,
  loader: () => Promise<T>,
  options?: { force?: boolean; staleMs?: number }
): Promise<CacheEntry<T>> {
  const staleMs = options?.staleMs ?? 60_000
  const existing = store.get(key) as CacheEntry<T> | undefined
  const fresh =
    existing &&
    existing.error == null &&
    existing.data !== undefined &&
    Date.now() - existing.updatedAt < staleMs

  if (existing && !options?.force && fresh) return existing

  if (existing?.promise && !options?.force) {
    await existing.promise
    return (store.get(key) as CacheEntry<T>) ?? { data: undefined as T, error: 'missing', updatedAt: 0 }
  }

  const gen = bumpGeneration(key)
  const entry: CacheEntry<T> = existing
    ? { ...existing }
    : { data: undefined as T, error: null, updatedAt: 0 }

  let loadPromise: Promise<void> = Promise.resolve()
  loadPromise = (async () => {
    try {
      const data = await loader()
      if (generations.get(key) !== gen) return
      const updatedAt = Date.now()
      store.set(key, { data, error: null, updatedAt })
      persistWrite(key, data, updatedAt)
    } catch (err) {
      if (generations.get(key) !== gen) return
      const message = err instanceof Error ? err.message : String(err)
      const prev = store.get(key) as CacheEntry<T> | undefined
      store.set(key, {
        data: (prev?.data ?? undefined) as T,
        error: message,
        updatedAt: prev?.updatedAt ?? 0
      })
    } finally {
      const current = store.get(key) as CacheEntry<T> | undefined
      if (current?.promise === loadPromise) {
        delete current.promise
        store.set(key, current)
      }
      emit(key)
    }
  })()

  entry.promise = loadPromise
  store.set(key, entry)
  emit(key)
  await loadPromise
  return (store.get(key) as CacheEntry<T>) ?? entry
}

export function prefetchQueryCache(key: string, loader: () => Promise<unknown>) {
  const existing = peekQueryCache(key)
  if (existing?.data !== undefined && existing.error == null) return
  void loadQueryCache(key, loader)
}
