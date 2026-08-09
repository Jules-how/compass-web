'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  loadQueryCache,
  peekQueryCache,
  prefetchQueryCache,
  subscribeQueryCache
} from '@/lib/query-cache'

export function useCachedJson<T>(
  key: string | null,
  url: string | null,
  options?: { staleMs?: number }
) {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => (key ? subscribeQueryCache(key, onStoreChange) : () => {}),
    () => (key ? peekQueryCache<T>(key) : null),
    () => null
  )

  const [bootstrapping, setBootstrapping] = useState(() => !snapshot?.data && !snapshot?.error)

  const reload = useCallback(
    async (force = true) => {
      if (!key || !url) return
      await loadQueryCache<T>(
        key,
        async () => {
          const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            cache: force ? 'no-store' : 'default'
          })
          if (!res.ok) throw new Error(`Failed to load (${res.status})`)
          return (await res.json()) as T
        },
        { force, staleMs: options?.staleMs }
      )
    },
    [key, url, options?.staleMs]
  )

  useEffect(() => {
    if (!key || !url) {
      setBootstrapping(false)
      return
    }
    let cancelled = false
    void loadQueryCache<T>(
      key,
      async () => {
        const res = await fetch(url, { headers: { Accept: 'application/json' } })
        if (!res.ok) throw new Error(`Failed to load (${res.status})`)
        return (await res.json()) as T
      },
      { force: false, staleMs: options?.staleMs }
    ).finally(() => {
      if (!cancelled) setBootstrapping(false)
    })
    return () => {
      cancelled = true
    }
  }, [key, url, options?.staleMs])

  return {
    data: snapshot?.data,
    error: snapshot?.error ?? null,
    loading: bootstrapping && snapshot?.data === undefined,
    updatedAt: snapshot?.updatedAt ?? 0,
    reload
  }
}

export function prefetchJson(key: string, url: string) {
  prefetchQueryCache(key, async () => {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Failed to load (${res.status})`)
    return res.json()
  })
}
