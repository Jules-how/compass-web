'use client'

import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useState } from 'react'
import { ConsoleHomeInboxKeepAlive } from '@/components/ConsoleHomeInboxKeepAlive'
import {
  ConsoleNavProvider,
  isKeepAlivePath,
  useConsoleNav,
  useConsoleViewPath,
} from '@/components/ConsoleNav'
import type { NavKey } from '@/components/NavLinks'
import { UndoProvider } from '@/components/UndoProvider'
import {
  FolioSidebar,
  FolioTopbar,
  FolioWorkspaceLinks,
} from '@/components/folio/FolioChrome'
import { INBOX_CACHE_KEY, type InboxPayload } from '@/lib/inbox-ui'
import { isOperatorRole, type PortalRole } from '@/lib/portal-redirect'
import { loadQueryCache } from '@/lib/query-cache'
import { prefetchJson } from '@/lib/use-cached-json'

const WIDTH = {
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-none',
} as const

const ConsoleChromeContext = createContext(false)

function ConsoleMain({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const viewPath = useConsoleViewPath()
  const keepAliveRoute = isKeepAlivePath(viewPath)
  // Use the real pathname for page children so we don't flash a stale RSC
  // tree while an optimistic keep-alive target is showing.
  const showChildren = !isKeepAlivePath(pathname) && !keepAliveRoute

  return (
    <div
      id="compass-main"
      tabIndex={-1}
      className="folio-scroll-region flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto scrollbar-gutter-stable"
    >
      {/*
        min-h-full + flex-1 lets flush pages (Inbox, Campaign Planner) fill the
        viewport like Linear, while still growing with tall non-flush pages so
        this column remains the scroll container.
        scrollbar-gutter:stable keeps the main column width fixed when tall
        pages (e.g. My Tasks Focus/Backlog) gain/lose a vertical scrollbar —
        otherwise mx-auto content shifts left/right between tabs.
      */}
      <div className="flex min-h-full flex-1 flex-col">
        <ConsoleHomeInboxKeepAlive />
        {showChildren ? (
          <div className="flex min-h-full flex-1 flex-col">{children}</div>
        ) : null}
      </div>
    </div>
  )
}

function OperatorConsoleLayoutInner({
  role,
  children,
}: {
  role: PortalRole
  children: ReactNode
}) {
  const router = useRouter()
  const operator = isOperatorRole(role)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    try { setSidebarCollapsed(localStorage.getItem('compass.sidebar.collapsed') === 'true') } catch { /* Storage is optional. */ }
  }, [])

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      try { localStorage.setItem('compass.sidebar.collapsed', String(!current)) } catch { /* Storage is optional. */ }
      return !current
    })
  }

  useEffect(() => {
    if (!operator) return

    // Prefetch RSC routes only. Eager API prefetch of Instantly / clients /
    // projects / campaigns on every console mount was a thundering herd —
    // hover/focus on NavLinks still warms individual APIs on demand.
    // Home plate needs /api/tasks; warm that with inbox so Home ↔ Inbox feels ready.
    // Prefetch the two busiest RSC shells. Prefetching every operator href on
    // mount stampeded force-dynamic layout auth (iad1 × Seoul).
    router.prefetch('/home')
    router.prefetch('/inbox')
    prefetchJson('/api/tasks', '/api/tasks')

    // Warm the shared inbox cache so opening Inbox (and tab switches) stay snappy.
    void loadQueryCache<InboxPayload>(
      INBOX_CACHE_KEY,
      async () => {
        const res = await fetch(INBOX_CACHE_KEY, {
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) throw new Error(`Failed to load (${res.status})`)
        return (await res.json()) as InboxPayload
      },
      { force: false },
    ).catch(() => {})
  }, [operator, router])

  return (
    <ConsoleChromeContext.Provider value={true}>
      <div className="compass-shell folio-shell" data-sidebar-collapsed={sidebarCollapsed}>
        <a
          href="#compass-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[110] focus:rounded-xl focus:bg-white focus:px-3.5 focus:py-2 focus:text-sm focus:font-medium focus:text-neutral-900 focus:shadow-soft"
        >
          Skip to main content
        </a>
        <FolioSidebar role={role} />
        <div className="folio-workspace">
          <FolioTopbar role={role} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
          <ConsoleMain>{children}</ConsoleMain>
        </div>
      </div>
    </ConsoleChromeContext.Provider>
  )
}

/** Persistent console chrome — sidebar stays mounted across operator routes. */
export function OperatorConsoleLayout({
  role,
  children,
}: {
  role: PortalRole
  children: ReactNode
}) {
  return (
    <ConsoleNavProvider>
      <UndoProvider>
        <OperatorConsoleLayoutInner role={role}>
          {children}
        </OperatorConsoleLayoutInner>
      </UndoProvider>
    </ConsoleNavProvider>
  )
}

function PageMain({
  title,
  subtitle,
  width = '6xl',
  flush = false,
  compact = false,
  actions,
  children,
}: {
  title?: ReactNode
  subtitle?: string
  width?: keyof typeof WIDTH
  flush?: boolean
  compact?: boolean
  actions?: ReactNode
  children: ReactNode
}) {
  const path = useConsoleViewPath()
  const links = path.startsWith('/clients')
    ? [
        { href: '/operations/delivery', label: 'Client delivery' },
        { href: '/operations/finances', label: 'Finances' },
        { href: '/operations/cs', label: 'Retention' },
      ]
    : path.startsWith('/sales/outbound')
      ? [
          { href: '/calendar', label: 'Calendar' },
          { href: '/sales/outbound/craft', label: 'Writing library' },
          { href: '/sales/offers', label: 'Offers & tests' },
          { href: '/sales', label: 'Sales overview' },
        ]
      : []
  if (flush) {
    return (
      <main data-width={width} className="folio-flush flex min-h-0 flex-1 flex-col">
        {children}
      </main>
    )
  }

  return (
    <main
      data-width={width}
      className={`folio-page mx-auto w-full ${WIDTH[width]} ${compact ? 'folio-page-compact' : ''}`}
    >
      {compact && title ? <h1 className="sr-only">{title}</h1> : null}
      {((title && !compact) || actions) && (
        <header
          className={`flex flex-wrap items-center justify-between gap-3 ${compact ? 'mb-2' : 'mb-7 items-end gap-4'}`}
        >
          <div className="min-w-0">
            {title && !compact ? (
              <h1
                className={
                  compact ? 'compass-page-title-compact' : 'compass-page-title'
                }
              >
                {title}
              </h1>
            ) : null}
            {subtitle && !compact ? (
              <p className="compass-page-subtitle">{subtitle}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>
      )}
      {links.length ? <FolioWorkspaceLinks links={links} /> : null}
      {children}
    </main>
  )
}

/** Page-level main canvas. Outside the console layout it still mounts full chrome. */
export function OperatorShell({
  active: _active,
  role = 'owner',
  title,
  subtitle,
  width = '6xl',
  flush = false,
  compact = false,
  actions,
  children,
}: {
  active?: NavKey
  role?: PortalRole
  title?: ReactNode
  subtitle?: string
  width?: keyof typeof WIDTH
  flush?: boolean
  compact?: boolean
  actions?: ReactNode
  children: ReactNode
}) {
  const inConsole = useContext(ConsoleChromeContext)
  const main = (
    <PageMain
      title={title}
      subtitle={subtitle}
      width={width}
      flush={flush}
      compact={compact}
      actions={actions}
    >
      {children}
    </PageMain>
  )

  if (inConsole) return main

  return <OperatorConsoleLayout role={role}>{main}</OperatorConsoleLayout>
}
