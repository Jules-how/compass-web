'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CompassMark } from '@/components/nav-icons'
import { NavLinks, type NavKey } from '@/components/NavLinks'
import SignOutButton from '@/components/SignOutButton'
import { isOperatorRole, type PortalRole } from '@/lib/portal-redirect'

const WIDTH = {
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
  full: 'max-w-none'
} as const

export function OperatorShell({
  active,
  role,
  title,
  subtitle,
  width = '6xl',
  flush = false,
  actions,
  children
}: {
  active: NavKey
  role: PortalRole
  title: string
  subtitle?: string
  width?: keyof typeof WIDTH
  /** Edge-to-edge main canvas (Campaign Planner). */
  flush?: boolean
  actions?: ReactNode
  children: ReactNode
}) {
  const operator = isOperatorRole(role)
  const [inboxCount, setInboxCount] = useState<number | null>(null)

  useEffect(() => {
    if (!operator) return
    let cancelled = false
    void fetch('/api/inbox', { headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) return null
        const body = (await res.json()) as { leads?: unknown[]; total?: number }
        return typeof body.total === 'number' ? body.total : body.leads?.length ?? null
      })
      .then((count) => {
        if (!cancelled && typeof count === 'number') setInboxCount(count)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [operator])

  return (
    <div className="compass-shell min-h-screen md:flex">
      <aside className="compass-sidebar flex w-full flex-col border-b border-neutral-200/80 md:w-[232px] md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-3 px-3 py-3.5 md:block">
          <Link
            href={operator ? '/home' : '/leads'}
            className="flex items-center gap-2.5 rounded-lg px-1 py-0.5"
          >
            <CompassMark />
            <div className="min-w-0 leading-tight">
              <span className="text-[14px] font-semibold tracking-tight text-neutral-900">
                switchflow
              </span>{' '}
              <span className="text-[14px] font-medium tracking-tight text-neutral-500">
                compass
              </span>
            </div>
          </Link>
          <div className="md:hidden">
            <SignOutButton variant="sidebar" />
          </div>
        </div>

        <div className="px-2.5 pb-3 md:flex md:min-h-0 md:flex-1 md:flex-col">
          <NavLinks
            active={active}
            role={role}
            orientation="vertical"
            inboxCount={inboxCount}
          />
        </div>

        <div className="hidden border-t border-neutral-200/80 px-2.5 py-3 md:block">
          <SignOutButton variant="sidebar" />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {flush ? (
          <main className="flex h-[100dvh] flex-col md:h-screen">{children}</main>
        ) : (
          <main className={`mx-auto ${WIDTH[width]} px-4 py-6 sm:px-6 lg:px-8`}>
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-neutral-900">
                  {title}
                </h1>
                {subtitle ? <p className="mt-1 text-sm text-neutral-500">{subtitle}</p> : null}
              </div>
              {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </header>
            {children}
          </main>
        )}
      </div>
    </div>
  )
}
