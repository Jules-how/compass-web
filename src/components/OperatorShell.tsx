'use client'

import type { ReactNode } from 'react'
import { NavLinks, type NavKey } from '@/components/NavLinks'
import type { PortalRole } from '@/lib/portal-redirect'

const WIDTH = {
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl'
} as const

export function OperatorShell({
  active,
  role,
  title,
  subtitle,
  width = '6xl',
  children
}: {
  active: NavKey
  role: PortalRole
  title: string
  subtitle?: string
  width?: keyof typeof WIDTH
  children: ReactNode
}) {
  return (
    <main className={`mx-auto ${WIDTH[width]} px-4 py-8`}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <NavLinks active={active} role={role} />
          </div>
          <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-neutral-500">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </main>
  )
}
