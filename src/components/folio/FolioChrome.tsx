'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  Compass,
  FolderOpen,
  Home,
  Inbox,
  Layers,
  Menu,
  NotebookPen,
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
const work = [
  { href: '/sales/outbound', label: 'Outbound', icon: Send },
  { href: '/leads', label: 'CRM', icon: Users },
  { href: '/clients', label: 'Clients', icon: BriefcaseBusiness },
  { href: '/operations/installs', label: 'Installs', icon: Layers },
  { href: '/planning', label: 'Planning', icon: NotebookPen },
]
const more = [
  { href: '/projects', label: 'Projects' },
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
      compass
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
  const link = (item: { href: string; label: string; icon?: typeof Home }) => {
    const Icon = item.icon ?? FolderOpen
    const active =
      path === item.href ||
      (item.href !== '/sales' && path.startsWith(item.href + '/'))
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
          nav?.navigate(item.href)
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
        <p className="folio-caption">Your day</p>
        {day.map(link)}
      </div>
      <div>
        <p className="folio-caption">Workspaces</p>
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
    <aside className="folio-sidebar">
      <FolioBrand />
      <FolioNavigation role={role} />
      <div className="folio-signout">
        <SignOutButton variant="sidebar" />
      </div>
    </aside>
  )
}
export function FolioTopbar({ role }: { role: PortalRole }) {
  const [open, setOpen] = useState(false)
  const path = useConsoleViewPath(),
    nav = useConsoleNav()
  const title =
    [...day, ...work, ...more, { href: '/settings', label: 'Settings' }]
      .filter((i) => path === i.href || path.startsWith(i.href + '/'))
      .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? 'Workspace'
  return (
    <>
      <header className="folio-topbar">
        <div className="folio-breadcrumb">
          Switchflow <span>/</span> {title}
        </div>
        <div className="folio-mobile-brand">
          <FolioBrand />
        </div>
        <button
          type="button"
          className="folio-icon-button"
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
