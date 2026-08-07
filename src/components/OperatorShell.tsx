'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { CompassMark } from '@/components/nav-icons'
import { NavLinks, navKeyFromPathname, type NavKey, OPERATOR_PREFETCH } from '@/components/NavLinks'
import SignOutButton from '@/components/SignOutButton'
import { Sidebar, SidebarBody } from '@/components/ui/sidebar'
import { prefetchJson } from '@/lib/use-cached-json'
import { isOperatorRole, type PortalRole } from '@/lib/portal-redirect'

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

    for (const item of OPERATOR_PREFETCH) {
      router.prefetch(item.href)
      if (item.api) prefetchJson(item.api, item.api)
    }

    void fetch('/api/inbox', { headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) return null
        const body = (await res.json()) as {
          leads?: unknown[]
          total?: number
          badgeTotal?: number
        }
        if (typeof body.badgeTotal === 'number') return body.badgeTotal
        return typeof body.total === 'number' ? body.total : body.leads?.length ?? null
      })
      .then((count) => {
        if (!cancelled && typeof count === 'number') setInboxCount(count)
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
  actions,
  children
}: {
  title?: string
  subtitle?: string
  width?: keyof typeof WIDTH
  flush?: boolean
  actions?: ReactNode
  children: ReactNode
}) {
  if (flush) {
    return <main className="flex h-[100dvh] flex-col md:h-full md:min-h-0">{children}</main>
  }

  return (
    <main className={`mx-auto ${WIDTH[width]} px-4 py-7 sm:px-6 lg:px-8`}>
      {(title || actions) && (
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {title ? <h1 className="compass-page-title">{title}</h1> : null}
            {subtitle ? <p className="compass-page-subtitle">{subtitle}</p> : null}
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
  actions,
  children
}: {
  active?: NavKey
  role?: PortalRole
  title?: string
  subtitle?: string
  width?: keyof typeof WIDTH
  flush?: boolean
  actions?: ReactNode
  children: ReactNode
}) {
  const inConsole = useContext(ConsoleChromeContext)
  const main = (
    <PageMain title={title} subtitle={subtitle} width={width} flush={flush} actions={actions}>
      {children}
    </PageMain>
  )

  if (inConsole) return main

  return <OperatorConsoleLayout role={role}>{main}</OperatorConsoleLayout>
}
