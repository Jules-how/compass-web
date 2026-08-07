'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { CompassMark } from '@/components/nav-icons'
import { NavLinks, navKeyFromPathname, type NavKey, OPERATOR_PREFETCH } from '@/components/NavLinks'
import SignOutButton from '@/components/SignOutButton'
import { Sidebar, SidebarBody } from '@/components/ui/sidebar'
import { INBOX_CACHE_KEY, type InboxPayload } from '@/lib/inbox-ui'
import { isOperatorRole, type PortalRole } from '@/lib/portal-redirect'
import { loadQueryCache } from '@/lib/query-cache'

const WIDTH = {
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
  full: 'max-w-none'
} as const

const ConsoleChromeContext = createContext(false)

function Brand({ href = '/home' }: { href?: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-xl px-1.5 py-1 transition hover:bg-white/60"
    >
      <CompassMark />
      <div className="min-w-0 overflow-hidden whitespace-nowrap leading-tight">
        <span className="text-[15px] font-semibold tracking-tight text-neutral-900">switchflow</span>{' '}
        <span className="text-[15px] font-medium tracking-tight text-neutral-500 transition group-hover:text-neutral-700">
          compass
        </span>
      </div>
    </Link>
  )
}

function ConsoleSidebarFrame({
  role,
  active,
  inboxCount
}: {
  role: PortalRole
  active: NavKey
  inboxCount: number | null
}) {
  const homeHref = isOperatorRole(role) ? '/home' : '/leads'
  return (
    <SidebarBody className="justify-between gap-6">
      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        <div className="mb-5 px-1">
          <Brand href={homeHref} />
        </div>
        <NavLinks active={active} role={role} orientation="vertical" inboxCount={inboxCount} />
      </div>
      <div className="border-t border-stone-200/70 px-0 pb-3 pt-3">
        <SignOutButton variant="sidebar" />
      </div>
    </SidebarBody>
  )
}

/** Persistent console chrome — sidebar stays mounted across operator routes. */
export function OperatorConsoleLayout({
  role,
  children
}: {
  role: PortalRole
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const operator = isOperatorRole(role)
  const active = useMemo(() => navKeyFromPathname(pathname), [pathname])
  const [inboxCount, setInboxCount] = useState<number | null>(null)
  // Mobile drawer open state only — desktop sidebar stays permanently expanded.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!operator) return
    let cancelled = false

    // Prefetch RSC routes only. Eager API prefetch of Instantly / clients /
    // projects / campaigns on every console mount was a thundering herd —
    // hover/focus on NavLinks still warms individual APIs on demand.
    for (const item of OPERATOR_PREFETCH) {
      router.prefetch(item.href)
    }

    // Warm the shared inbox cache so opening Inbox (and tab switches) stay snappy.
    void loadQueryCache<InboxPayload>(
      INBOX_CACHE_KEY,
      async () => {
        const res = await fetch(INBOX_CACHE_KEY, { headers: { Accept: 'application/json' } })
        if (!res.ok) throw new Error(`Failed to load (${res.status})`)
        return (await res.json()) as InboxPayload
      },
      { force: false }
    )
      .then((entry) => {
        if (cancelled || !entry.data) return
        const body = entry.data
        const count =
          typeof body.badgeTotal === 'number'
            ? body.badgeTotal
            : typeof body.total === 'number'
              ? body.total
              : body.leads?.length ?? null
        if (typeof count === 'number') setInboxCount(count)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [operator, router])

  return (
    <ConsoleChromeContext.Provider value={true}>
      <div className="compass-shell min-h-screen md:flex md:h-[100dvh] md:max-h-[100dvh] md:overflow-hidden">
        <Sidebar open={open} setOpen={setOpen} animate={false}>
          <ConsoleSidebarFrame role={role} active={active} inboxCount={inboxCount} />
        </Sidebar>
        <div className="min-w-0 flex-1 md:min-h-0 md:overflow-y-auto">
          <div className="animate-fade-up">{children}</div>
        </div>
      </div>
    </ConsoleChromeContext.Provider>
  )
}

function PageMain({
  title,
  subtitle,
  width = '6xl',
  flush = false,
  compact = false,
  actions,
  children
}: {
  title?: string
  subtitle?: string
  width?: keyof typeof WIDTH
  flush?: boolean
  compact?: boolean
  actions?: ReactNode
  children: ReactNode
}) {
  if (flush) {
    return <main className="flex h-[100dvh] flex-col md:h-full md:min-h-0">{children}</main>
  }

  return (
    <main
      className={`mx-auto ${WIDTH[width]} px-4 sm:px-6 lg:px-8 ${compact ? 'py-3' : 'py-7'}`}
    >
      {(title || actions) && (
        <header
          className={`flex flex-wrap items-center justify-between gap-3 ${compact ? 'mb-2' : 'mb-7 items-end gap-4'}`}
        >
          <div className="min-w-0">
            {title ? (
              <h1 className={compact ? 'compass-page-title-compact' : 'compass-page-title'}>
                {title}
              </h1>
            ) : null}
            {subtitle && !compact ? <p className="compass-page-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      )}
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
  children
}: {
  active?: NavKey
  role?: PortalRole
  title?: string
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
