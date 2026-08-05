'use client'

import { isOperatorRole, type PortalRole } from '@/lib/portal-redirect'
import Link from 'next/link'

export type NavKey =
  | 'leads'
  | 'inbox'
  | 'tasks'
  | 'projects'
  | 'functions'
  | 'delivery'
  | 'upload'

const OPERATOR_LINKS: { href: string; label: string; key: NavKey; api?: string }[] = [
  { href: '/inbox', label: 'Inbox', key: 'inbox', api: '/api/inbox' },
  { href: '/tasks', label: 'My issues', key: 'tasks', api: '/api/tasks' },
  { href: '/projects', label: 'Projects', key: 'projects', api: '/api/projects' },
  { href: '/functions', label: 'Functions', key: 'functions', api: '/api/functions' },
  { href: '/leads', label: 'Leads', key: 'leads', api: '/api/leads/list?page=1' }
]

const CUSTOMER_LINKS: { href: string; label: string; key: NavKey; api?: string }[] = [
  { href: '/leads', label: 'Leads', key: 'leads' }
]

function prefetchApi(api?: string) {
  if (!api || typeof window === 'undefined') return
  void fetch(api, { headers: { Accept: 'application/json' } }).catch(() => {})
}

export function NavLinks({
  active,
  role,
  orientation = 'horizontal'
}: {
  active: NavKey
  role: PortalRole
  orientation?: 'horizontal' | 'vertical'
}) {
  const links = isOperatorRole(role) ? OPERATOR_LINKS : CUSTOMER_LINKS
  const vertical = orientation === 'vertical'

  return (
    <nav className={vertical ? 'flex flex-col gap-0.5' : 'flex flex-wrap items-center gap-1'}>
      {links.map((link) => {
        const isActive = active === link.key
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch
            onMouseEnter={() => prefetchApi(link.api)}
            onFocus={() => prefetchApi(link.api)}
            className={
              vertical
                ? `rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-100'
                  }`
                : `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-sf-orange/10 text-sf-orange-dark'
                      : 'text-neutral-600 hover:bg-neutral-100'
                  }`
            }
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
