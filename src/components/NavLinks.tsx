'use client'

import { isOperatorRole, type PortalRole } from '@/lib/portal-redirect'
import type { ComponentType, SVGProps } from 'react'
import {
  ClientsIcon,
  FinancesIcon,
  FunctionsIcon,
  HomeIcon,
  InboxIcon,
  OverviewIcon,
  PipelineIcon,
  ProjectsIcon,
  SettingsIcon,
  TasksIcon
} from '@/components/nav-icons'
import { SidebarLabel, SidebarLink } from '@/components/ui/sidebar'
import { prefetchJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

export type NavKey =
  | 'home'
  | 'inbox'
  | 'tasks'
  | 'projects'
  | 'functions'
  | 'clients'
  | 'sales-overview'
  | 'pipeline'
  | 'finances'
  | 'settings'
  | 'leads'
  | 'delivery'
  | 'upload'

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { title?: string }>

type NavItem = {
  href: string
  label: string
  key: NavKey
  icon: IconComponent
  api?: string
  badge?: 'inbox'
}

type NavSection = {
  id: string
  label?: string
  items: NavItem[]
}

const OPERATOR_TOP: NavItem[] = [
  { href: '/home', label: 'Home', key: 'home', icon: HomeIcon },
  { href: '/inbox', label: 'Inbox', key: 'inbox', icon: InboxIcon, api: '/api/inbox', badge: 'inbox' }
]

const OPERATOR_SECTIONS: NavSection[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { href: '/tasks', label: 'My Tasks', key: 'tasks', icon: TasksIcon, api: '/api/tasks' },
      { href: '/projects', label: 'Projects', key: 'projects', icon: ProjectsIcon, api: '/api/projects' },
      {
        href: '/functions',
        label: 'Functions',
        key: 'functions',
        icon: FunctionsIcon,
        api: '/api/functions'
      },
      { href: '/clients', label: 'Clients', key: 'clients', icon: ClientsIcon, api: '/api/clients' }
    ]
  },
  {
    id: 'sales',
    label: 'Sales',
    items: [
      { href: '/sales', label: 'Overview', key: 'sales-overview', icon: OverviewIcon },
      {
        href: '/sales/pipeline',
        label: 'Pipeline',
        key: 'pipeline',
        icon: PipelineIcon,
        api: '/api/campaigns'
      }
    ]
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { href: '/operations/finances', label: 'Finances', key: 'finances', icon: FinancesIcon }
    ]
  }
]

const OPERATOR_FOOTER: NavItem[] = [
  { href: '/settings', label: 'Settings', key: 'settings', icon: SettingsIcon }
]

const CUSTOMER_LINKS: NavItem[] = [
  { href: '/leads', label: 'Leads', key: 'leads', icon: InboxIcon }
]

export const OPERATOR_PREFETCH = [
  ...OPERATOR_TOP,
  ...OPERATOR_SECTIONS.flatMap((section) => section.items),
  ...OPERATOR_FOOTER
].map((item) => ({ href: item.href, api: item.api }))

export function navKeyFromPathname(pathname: string | null): NavKey {
  if (!pathname) return 'home'
  if (pathname === '/sales' || pathname.startsWith('/sales/')) {
    if (pathname.startsWith('/sales/pipeline')) return 'pipeline'
    return 'sales-overview'
  }
  if (pathname.startsWith('/operations/finances')) return 'finances'
  if (pathname.startsWith('/projects')) return 'projects'
  if (pathname.startsWith('/functions')) return 'functions'
  if (pathname.startsWith('/tasks')) return 'tasks'
  if (pathname.startsWith('/inbox')) return 'inbox'
  if (pathname.startsWith('/clients')) return 'clients'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/leads')) return 'leads'
  if (pathname.startsWith('/delivery')) return 'delivery'
  if (pathname.startsWith('/home')) return 'home'
  return 'home'
}

function prefetchApi(api?: string) {
  if (!api || typeof window === 'undefined') return
  prefetchJson(api, api)
}

function NavItemLink({
  item,
  active,
  inboxCount
}: {
  item: NavItem
  active: NavKey
  inboxCount?: number | null
}) {
  const isActive = active === item.key
  const Icon = item.icon
  const showBadge =
    item.badge === 'inbox' && typeof inboxCount === 'number' && inboxCount > 0

  return (
    <SidebarLink
      link={{
        href: item.href,
        label: item.label,
        icon: (
          <Icon className={cn('h-[18px] w-[18px]', isActive ? 'text-neutral-800' : 'text-neutral-500')} />
        )
      }}
      active={isActive}
      onMouseEnter={() => prefetchApi(item.api)}
      onFocus={() => prefetchApi(item.api)}
      badge={
        showBadge ? (
          <span className="rounded-full bg-[#e85d2a] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
            {inboxCount! > 99 ? '99+' : inboxCount}
          </span>
        ) : undefined
      }
    />
  )
}

export function NavLinks({
  active,
  role,
  orientation = 'horizontal',
  inboxCount = null
}: {
  active: NavKey
  role: PortalRole
  orientation?: 'horizontal' | 'vertical'
  inboxCount?: number | null
}) {
  if (!isOperatorRole(role)) {
    const vertical = orientation === 'vertical'
    return (
      <nav className={vertical ? 'flex flex-col gap-0.5' : 'flex flex-wrap items-center gap-1'}>
        {CUSTOMER_LINKS.map((item) => (
          <NavItemLink key={item.href} item={item} active={active} />
        ))}
      </nav>
    )
  }

  if (orientation === 'horizontal') {
    const flat = [
      ...OPERATOR_TOP,
      ...OPERATOR_SECTIONS.flatMap((section) => section.items),
      ...OPERATOR_FOOTER
    ]
    return (
      <nav className="flex flex-wrap items-center gap-1">
        {flat.map((item) => (
          <NavItemLink key={item.href} item={item} active={active} inboxCount={inboxCount} />
        ))}
      </nav>
    )
  }

  return (
    <nav className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        {OPERATOR_TOP.map((item) => (
          <NavItemLink key={item.href} item={item} active={active} inboxCount={inboxCount} />
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {OPERATOR_SECTIONS.map((section) => (
          <div key={section.id} className="flex flex-col gap-1">
            {section.label ? <SidebarLabel>{section.label}</SidebarLabel> : null}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavItemLink
                  key={item.href}
                  item={item}
                  active={active}
                  inboxCount={inboxCount}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-neutral-200/80 pt-3">
        {OPERATOR_FOOTER.map((item) => (
          <NavItemLink key={item.href} item={item} active={active} inboxCount={inboxCount} />
        ))}
      </div>
    </nav>
  )
}
