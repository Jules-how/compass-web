'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
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
  actions,
  children
}: {
  active: NavKey
  role: PortalRole
  title: string
  subtitle?: string
  width?: keyof typeof WIDTH
  actions?: ReactNode
  children: ReactNode
}) {
  const operator = isOperatorRole(role)

  return (
    <div className="compass-shell min-h-screen md:flex">
      <aside className="compass-sidebar flex w-full flex-col border-b border-white/10 md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-4 md:block">
          <Link href={operator ? '/tasks' : '/leads'} className="block">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">
              Switchflow
            </div>
            <div className="mt-1 font-display text-xl font-semibold tracking-tight text-white">
              Compass
            </div>
          </Link>
          <div className="md:hidden">
            <SignOutButton variant="sidebar" />
          </div>
        </div>

        <div className="px-3 pb-3 md:flex-1">
          <NavLinks active={active} role={role} orientation="vertical" />
        </div>

        <div className="hidden border-t border-white/10 px-3 py-3 md:block">
          <SignOutButton variant="sidebar" />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
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
      </div>
    </div>
  )
}
