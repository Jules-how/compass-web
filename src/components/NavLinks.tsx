'use client'

import { isOperatorRole, type PortalRole } from '@/lib/portal-redirect'
import type { ComponentType, SVGProps } from 'react'
import {
  ClientsIcon,
  CrmIcon,
  FinancesIcon,
  FunctionsIcon,
  HomeIcon,
  InboxIcon,
  OutboundIcon,
  OverviewIcon,
  PipelineIcon,
  ProjectsIcon,
  SettingsIcon,
  TasksIcon
} from '@/components/nav-icons'
import { useConsoleNav } from '@/components/ConsoleNav'
import { SidebarLabel, SidebarLink } from '@/components/ui/sidebar'
import { prefetchJson } from '@/lib/use-cached-json'
import { LEAD_PAGE_SIZE } from '@/lib/list-columns'
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
  | 'outbound'
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
  // Home loads several APIs itself; do not hover-prefetch Instantly (4 upstream calls).
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
      { href: '/sales', label: 'Overview', key: 'sales-overview', icon: OverviewIcon, api: '/api/instantly/sales-overview' },
      {
        href: '/sales/pipeline',
        label: 'Pipeline',
        key: 'pipeline',
        icon: PipelineIcon,
        api: '/api/campaigns'
      },
      {
        href: '/sales/outbound',
        label: 'Outbound',
        key: 'outbound',
        icon: OutboundIcon,
        api: '/api/instantly/outbound-campaigns'
      },
      {
        href: '/leads',
        label: 'CRM',
        key: 'leads',
        icon: CrmIcon,
        api: `/api/leads/list?page=1&pageSize=${LEAD_PAGE_SIZE}`
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
    if (pathname.startsWith('/sales/outbound')) return 'outbound'
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

function prefetchApi(api?: string, key?: NavKey) {
  if (typeof window === 'undefined') return
  if (api) prefetchJson(api, api)
  if (key === 'outbound') {
    prefetchJson('/api/campaigns', '/api/campaigns')
  }
  if (key === 'leads') {
    prefetchJson('leads:summary:global', '/api/leads/summary')
    prefetchJson('leads:facets', '/api/leads/facets')
  }
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
  const consoleNav = useConsoleNav()
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
          <Icon className={cn('h-[17px] w-[17px]', isActive ? 'text-[#e85d2a]' : 'text-current')} />
        )
      }}
      active={isActive}
      onMouseEnter={() => prefetchApi(item.api, item.key)}
      onFocus={() => prefetchApi(item.api, item.key)}
      onClick={(event) => {
        if (!consoleNav) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        if (event.button !== 0) return
        event.preventDefault()
        prefetchApi(item.api, item.key)
        consoleNav.navigate(item.href)
      }}
      badge={
        showBadge ? (
          <span className="min-w-[1.25rem] rounded-md bg-[#e85d2a] px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
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

      <div className="mt-auto flex flex-col gap-0.5 border-t border-stone-200/70 pt-3">
        {OPERATOR_FOOTER.map((item) => (
          <NavItemLink key={item.href} item={item} active={active} inboxCount={inboxCount} />
        ))}
      </div>
    </nav>
  )
}
