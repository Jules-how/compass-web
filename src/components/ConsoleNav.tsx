'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { usePathname, useRouter } from 'next/navigation'

type ConsoleNavContextValue = {
  /** Path used for chrome + keep-alive (optimistic while RSC catches up). */
  viewPath: string
  /** True while a client navigation is in flight from a nav click. */
  pending: boolean
  /** Optimistically switch the visible console surface, then soft-navigate. */
  navigate: (href: string) => void
}

const ConsoleNavContext = createContext<ConsoleNavContextValue | null>(null)

function pathKey(path: string) {
  return path.split('?')[0] || path
}

export function isHomeOrInboxPath(path: string) {
  const key = keepAliveKey(path)
  return key === 'home' || key === 'inbox'
}

/** Surfaces kept mounted in the console shell after first visit. */
export function keepAliveKey(
  path: string
): 'home' | 'inbox' | 'sales' | 'outbound' | 'leads' | null {
  const p = path.split('?')[0] || path
  if (p === '/home' || p.startsWith('/home/')) return 'home'
  if (p === '/inbox' || p.startsWith('/inbox/')) return 'inbox'
  if (p === '/sales') return 'sales'
  if (p === '/sales/pipeline' || p === '/sales/outbound') return 'outbound'
  if (p === '/leads') return 'leads'
  return null
}

export function isKeepAlivePath(path: string) {
  return keepAliveKey(path) !== null
}

export function ConsoleNavProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null)

  useEffect(() => {
    setOptimisticPath((prev) => {
      if (!prev) return null
      // Latest click target reached — drop optimism.
      if (pathKey(pathname) === pathKey(prev)) return null
      // An older in-flight navigation resolved to a different path; keep waiting
      // for the latest optimistic target (rapid Home ↔ Inbox clicks).
      return prev
    })
  }, [pathname])

  // Safety: don't leave the UI stuck if a navigation never resolves.
  useEffect(() => {
    if (!optimisticPath) return
    const timer = window.setTimeout(() => setOptimisticPath(null), 10_000)
    return () => window.clearTimeout(timer)
  }, [optimisticPath])

  const navigate = useCallback(
    (href: string) => {
      const next = pathKey(href)
      const current = pathKey(optimisticPath ?? pathname)
      if (next === current) return

      // Instantly swap only when the destination is a keep-alive surface.
      // Leaving those routes stays on the current panel until the real RSC
      // children arrive — avoids a blank main canvas.
      if (isKeepAlivePath(next)) {
        setOptimisticPath(next)
      } else {
        setOptimisticPath(null)
      }
      router.push(href)
    },
    [optimisticPath, pathname, router]
  )

  const viewPath = optimisticPath ?? pathname
  const pending = Boolean(optimisticPath && pathKey(optimisticPath) !== pathKey(pathname))

  const value = useMemo(
    () => ({ viewPath, pending, navigate }),
    [viewPath, pending, navigate]
  )

  return <ConsoleNavContext.Provider value={value}>{children}</ConsoleNavContext.Provider>
}

export function useConsoleNav() {
  return useContext(ConsoleNavContext)
}

/** Prefer optimistic console path when inside the operator shell. */
export function useConsoleViewPath() {
  const pathname = usePathname()
  const consoleNav = useConsoleNav()
  return consoleNav?.viewPath ?? pathname
}
