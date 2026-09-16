'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { outboundDeskFromSearch } from '@/lib/outbound-desk'
import { useState } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  Compass,
  FolderOpen,
  FileText,
  Home,
  Inbox,
  Layers,
  Menu,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { useConsoleNav, useConsoleViewPath } from '@/components/ConsoleNav'
import { ModalFrame } from '@/components/ui/ModalFrame'
import SignOutButton from '@/components/SignOutButton'
import { isOperatorRole, type PortalRole } from '@/lib/portal-redirect'

const day = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/tasks', label: 'Tasks', icon: CheckCheck },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
]
const workspace = [
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/planning', label: 'Goals & actions', icon: NotebookPen },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
]
const work = [
  { href: '/sales/outbound', label: 'Outbound', icon: Send },
  { href: '/leads', label: 'CRM', icon: Users },
  { href: '/clients', label: 'Clients', icon: BriefcaseBusiness },
  { href: '/operations/installs', label: 'Installs', icon: Layers },
]
const more = [
  { href: '/sales/outbound?desk=evidence', label: 'Outbound evidence' },
  { href: '/sales/outbound?desk=notebook', label: 'Outbound notebook' },
  { href: '/sales/outbound?desk=waves', label: 'Outbound waves' },
  { href: '/functions', label: 'Functions' },
  { href: '/sales', label: 'Sales overview' },
  { href: '/sales/offers', label: 'Offers & tests' },
  { href: '/sales/offer-plan', label: 'Offer economics' },
  { href: '/sales/experiments', label: 'Email experiments' },
  { href: '/operations/delivery', label: 'Client delivery' },
  { href: '/operations/finances', label: 'Finances' },
  { href: '/operations/cs', label: 'Retention' },
]
export function FolioBrand() {
  return (
    <Link className="folio-brand" href="/home">
      <Compass aria-hidden="true" strokeWidth={1.3} />
      <span>Switchflow</span>
    </Link>
  )
}
export function FolioNavigation({
  role,
  onNavigate,
}: {
  role: PortalRole
  onNavigate?: () => void
}) {
  const nav = useConsoleNav(),
    path = useConsoleViewPath()
  const searchParams = useSearchParams()
  const currentDesk = outboundDeskFromSearch(searchParams.toString())
  const link = (item: { href: string; label: string; icon?: typeof Home }) => {
    const Icon = item.icon ?? FolderOpen
    const active = item.href.includes('?desk=')
      ? path === '/sales/outbound' && currentDesk === item.href.split('?desk=')[1]
      : item.href === '/sales/outbound' && path === '/sales/outbound'
        ? !['evidence', 'notebook', 'waves'].includes(currentDesk)
        : path === item.href || (item.href !== '/sales' && path.startsWith(item.href + '/'))
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className="folio-nav-link"
        onClick={(e) => {
          if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
            return
          e.preventDefault()
          onNavigate?.()
          if (nav) nav.navigate(item.href)
          else window.location.assign(item.href)
        }}
      >
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
        {item.label}
        {active ? <span className="folio-nav-dot" /> : null}
      </Link>
    )
  }
  if (!isOperatorRole(role))
    return <nav aria-label="Workspace">{link(work[1])}</nav>
  return (
    <nav aria-label="Primary" className="folio-navigation">
      <div>
        <p className="sr-only">Your day</p>
        {day.map(link)}
      </div>
      <div>
        <p className="folio-caption">Workspaces</p>
        {workspace.map(link)}
      </div>
      <div>
        <p className="folio-caption">Business</p>
        {work.map(link)}
      </div>
      <details className="folio-more">
        <summary>
          More workspaces <ChevronDown size={14} aria-hidden="true" />
        </summary>
        {more.map(link)}
      </details>
      <div className="folio-nav-settings">
        {link({ href: '/settings', label: 'Settings', icon: Settings })}
      </div>
    </nav>
  )
}
export function FolioSidebar({ role }: { role: PortalRole }) {
  return (
    <aside id="compass-sidebar" className="folio-sidebar" aria-label="Workspace navigation">
      <FolioBrand />
      <FolioNavigation role={role} />
      <div className="folio-signout">
        <SignOutButton variant="sidebar" />
      </div>
    </aside>
  )
}
export function FolioTopbar({ role, sidebarCollapsed = false, onToggleSidebar }: { role: PortalRole; sidebarCollapsed?: boolean; onToggleSidebar?: () => void }) {
  const [open, setOpen] = useState(false)
  const path = useConsoleViewPath(),
    nav = useConsoleNav()
  const destination =
    [...day, ...workspace, ...work, ...more, { href: '/settings', label: 'Settings' }]
      .filter((i) => path === i.href || path.startsWith(i.href + '/'))
      .sort((a, b) => b.href.length - a.href.length)[0]
  const title = destination?.label ?? 'Workspace'
  const section = work.some(item => item.href === destination?.href) || more.some(item => item.href === destination?.href)
    ? 'Business' : workspace.some(item => item.href === destination?.href) ? 'Workspace' : null
  return (
    <>
      <header className="folio-topbar">
        <div className="folio-topbar-context">
          <button
            type="button"
            className="folio-icon-button folio-sidebar-toggle"
            aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            aria-expanded={!sidebarCollapsed}
            aria-controls="compass-sidebar"
            onClick={onToggleSidebar}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          </button>
          <div className="folio-breadcrumb">
            {section ? <><span>{section}</span><span aria-hidden="true">/</span></> : null}
            <strong>{title}</strong>
          </div>
        </div>
        <div className="folio-mobile-brand">
          <FolioBrand />
        </div>
        <button
          type="button"
          className="folio-icon-button folio-navigation-trigger"
          aria-label="Open workspace navigation"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <Menu size={18} />
        </button>
      </header>
      <nav className="folio-mobile-nav" aria-label="Mobile primary">
        {[day[0], day[1], work[0]].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={
              path === href || path.startsWith(href + '/') ? 'page' : undefined
            }
            onClick={(e) => {
              if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
                return
              e.preventDefault()
              nav?.navigate(href)
            }}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          <Menu size={18} />
          More
        </button>
      </nav>
      <ModalFrame
        open={open}
        onClose={() => setOpen(false)}
        label="Your workspace"
        overlayClassName="folio-overlay"
        contentClassName="folio-dialog folio-navigation-dialog"
      >
        <button
          className="folio-icon-button folio-dialog-close"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X size={20} />
        </button>
        <p className="folio-caption">Compass</p>
        <h2>Your workspace</h2>
        <FolioNavigation role={role} onNavigate={() => setOpen(false)} />
        <SignOutButton variant="sidebar" />
      </ModalFrame>
    </>
  )
}
export function FolioWorkspaceLinks({
  links,
}: {
  links: { href: string; label: string }[]
}) {
  return (
    <nav className="folio-workspace-links" aria-label="Related workspaces">
      {links.map((l) => (
        <Link key={l.href} href={l.href}>
          {l.label}
          <ArrowUpRight size={13} />
        </Link>
      ))}
    </nav>
  )
}
