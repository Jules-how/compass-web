'use client'

import { useActivePane } from '@/components/ActivePane'
import { onWorkChanged } from '@/lib/workspace-change'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import {
  loadQueryCache,
  peekQueryCache,
  prefetchQueryCache,
  subscribeQueryCache
} from '@/lib/query-cache'

export function useCachedJson<T>(
  key: string | null,
  url: string | null,
  options?: { staleMs?: number; enabled?: boolean }
) {
  const paneActive = useActivePane()
  const enabled = paneActive && options?.enabled !== false
  const invalidated = useRef(false)
  const snapshot = useSyncExternalStore(
    (onStoreChange) => (key ? subscribeQueryCache(key, onStoreChange) : () => {}),
    () => (key ? peekQueryCache<T>(key) : null),
    () => null
  )

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
    if (!key || !url || !enabled) return
    const force = invalidated.current
    invalidated.current = false
    void reload(force)
  }, [key, url, enabled, reload])

  useEffect(() => {
    if (!key || !/^\/api\/(tasks|projects|home|pathfinder)(\/|\?|$)/.test(key)) return
    const mutation = () => {
      if (!enabled || document.visibilityState !== 'visible') { invalidated.current = true; return }
      void reload(true)
    }
    const refresh = () => {
      if (!enabled || document.visibilityState !== 'visible') return
      const force = invalidated.current
      invalidated.current = false
      void reload(force)
    }
    const unsubscribe = onWorkChanged(mutation)
    if (!enabled) return unsubscribe
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = /^\/api\/home(\/|\?|$)/.test(key) ? null : window.setInterval(refresh, 30_000)
    return () => { unsubscribe(); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); if (timer !== null) window.clearInterval(timer) }
  }, [key, enabled, reload])

  return {
    data: snapshot?.data,
    error: snapshot?.error ?? null,
    loading: Boolean(key && url && enabled && snapshot?.data === undefined && (!snapshot?.error || snapshot?.promise)),
    refreshing: Boolean(snapshot?.promise),
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
