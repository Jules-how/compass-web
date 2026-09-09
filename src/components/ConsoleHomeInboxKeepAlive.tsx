'use client'

import dynamic from 'next/dynamic'
import { Suspense, useEffect, useState } from 'react'
import { keepAliveKey, useConsoleViewPath } from '@/components/ConsoleNav'
import { LoadingBlock } from '@/components/LoadingBlock'
import { OperatorShell } from '@/components/OperatorShell'
import { cn } from '@/lib/utils'

function DeskLoading({ label }: { label: string }) {
  return (
    <div className="px-4 py-3 sm:px-6">
      <LoadingBlock label={label} />
    </div>
  )
}

const HomeDashboard = dynamic(
  () => import('@/components/home/HomeDashboard').then((m) => ({ default: m.HomeDashboard })),
  { loading: () => <DeskLoading label="Loading home…" /> }
)
const InboxPanel = dynamic(
  () => import('@/components/InboxPanel').then((m) => ({ default: m.InboxPanel })),
  { loading: () => <DeskLoading label="Loading inbox…" /> }
)
const SalesOverview = dynamic(
  () => import('@/components/sales/SalesOverview').then((m) => ({ default: m.SalesOverview })),
  { loading: () => <DeskLoading label="Loading sales…" /> }
)
const OffersDesk = dynamic(
  () => import('@/components/offers/OffersDesk').then((m) => ({ default: m.OffersDesk })),
  { loading: () => <DeskLoading label="Loading offers…" /> }
)
const OutboundDesk = dynamic(
  () => import('@/components/outbound/OutboundDesk').then((m) => ({ default: m.OutboundDesk })),
  { loading: () => <DeskLoading label="Loading outbound…" /> }
)
const LeadsPanel = dynamic(
  () => import('@/components/LeadsPanel').then((m) => ({ default: m.LeadsPanel })),
  { loading: () => <DeskLoading label="Loading leads…" /> }
)
const TasksPanel = dynamic(
  () => import('@/components/TasksPanel').then((m) => ({ default: m.TasksPanel })),
  { loading: () => <DeskLoading label="Loading tasks…" /> }
)
const ProjectsPanel = dynamic(
  () => import('@/components/ProjectsPanel').then((m) => ({ default: m.ProjectsPanel })),
  { loading: () => <DeskLoading label="Loading projects…" /> }
)
const FunctionsPanel = dynamic(
  () => import('@/components/FunctionsPanel').then((m) => ({ default: m.FunctionsPanel })),
  { loading: () => <DeskLoading label="Loading functions…" /> }
)
const ClientsPanel = dynamic(
  () => import('@/components/ClientsPanel').then((m) => ({ default: m.ClientsPanel })),
  { loading: () => <DeskLoading label="Loading clients…" /> }
)
const FinancesBoard = dynamic(
  () => import('@/components/finances/ExpenseBoard').then((m) => ({ default: m.ExpenseBoard })),
  { loading: () => <DeskLoading label="Loading finances…" /> }
)
const InstallKanban = dynamic(
  () =>
    import('@/components/delivery-dept/InstallKanban').then((m) => ({ default: m.InstallKanban })),
  { loading: () => <DeskLoading label="Loading installs…" /> }
)
const CsDeptBoard = dynamic(
  () => import('@/components/cs-dept/CsDeptBoard').then((m) => ({ default: m.CsDeptBoard })),
  { loading: () => <DeskLoading label="Loading retention…" /> }
)

function KeepAlivePane({
  active,
  className,
  children
}: {
  active: boolean
  className?: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!active) return
    window.dispatchEvent(new Event('resize'))
  }, [active])

  return (
    <div
      className={cn(active ? 'flex min-h-full flex-1 flex-col' : 'hidden', className)}
      aria-hidden={!active}
      inert={!active ? true : undefined}
    >
      {children}
    </div>
  )
}

function useSeen(active: boolean) {
  const [seen, setSeen] = useState(active)
  useEffect(() => {
    if (active) setSeen(true)
  }, [active])
  return seen
}

/**
 * Keeps operator list surfaces mounted after first visit so sidebar switches
 * do not remount or wait on RSC. Heavy desks load on first visit only.
 */
export function ConsoleHomeInboxKeepAlive() {
  const viewPath = useConsoleViewPath()
  const key = keepAliveKey(viewPath)
  const showHome = key === 'home'
  const showInbox = key === 'inbox'
  const showTasks = key === 'tasks'
  const showProjects = key === 'projects'
  const showFunctions = key === 'functions'
  const showClients = key === 'clients'
  const showOverview = key === 'sales'
  const showOffers = key === 'offers'
  const showOutbound = key === 'outbound'
  const showCrm = key === 'leads'
  const showFinances = key === 'finances'
  const showInstalls = key === 'installs'
  const showRetention = key === 'retention'
  const seenHome = useSeen(showHome)
  const seenInbox = useSeen(showInbox)
  const seenTasks = useSeen(showTasks)
  const seenProjects = useSeen(showProjects)
  const seenFunctions = useSeen(showFunctions)
  const seenClients = useSeen(showClients)
  const seenOverview = useSeen(showOverview)
  const seenOffers = useSeen(showOffers)
  const seenOutbound = useSeen(showOutbound)
  const seenCrm = useSeen(showCrm)
  const seenFinances = useSeen(showFinances)
  const seenInstalls = useSeen(showInstalls)
  const seenRetention = useSeen(showRetention)

  if (
    !seenHome &&
    !seenInbox &&
    !seenTasks &&
    !seenProjects &&
    !seenFunctions &&
    !seenClients &&
    !seenOverview &&
    !seenOffers &&
    !seenOutbound &&
    !seenCrm &&
    !seenFinances &&
    !seenInstalls &&
    !seenRetention
  ) {
    return null
  }

  return (
    <>
      {seenHome ? (
        <KeepAlivePane active={showHome}>
          <div className="flex min-h-0 flex-1 flex-col">
            <HomeDashboard />
          </div>
        </KeepAlivePane>
      ) : null}
      {seenInbox ? (
        <KeepAlivePane active={showInbox}>
          <main className="flex min-h-0 flex-1 flex-col">
            <Suspense
              fallback={
                <div className="flex flex-1 p-3 sm:p-4">
                  <LoadingBlock label="Loading inbox…" />
                </div>
              }
            >
              <InboxPanel />
            </Suspense>
          </main>
        </KeepAlivePane>
      ) : null}
      {seenTasks ? (
        <KeepAlivePane active={showTasks}>
          <OperatorShell title="Tasks" subtitle="Choose the work you can move. Keep external waits in their own place." width="full">
            <TasksPanel />
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenProjects ? (
        <KeepAlivePane active={showProjects}>
          <OperatorShell title="Projects" width="full" compact>
            <ProjectsPanel />
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenFunctions ? (
        <KeepAlivePane active={showFunctions}>
          <OperatorShell
            title="Functions"
            subtitle="System map — how modules connect to live routes and tables"
            width="full"
          >
            <FunctionsPanel />
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenClients ? (
        <KeepAlivePane active={showClients}>
          <OperatorShell
            title="Clients"
            subtitle="Accounts, relationships, and delivery workspaces"
            width="6xl"
          >
            <ClientsPanel />
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenOverview ? (
        <KeepAlivePane active={showOverview}>
          <OperatorShell
            title="Sales"
            subtitle="Overview · Instantly throughput, targeting map, replies, and deal flow"
            width="full"
          >
            <SalesOverview />
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenOffers ? (
        <KeepAlivePane active={showOffers}>
          <OffersDesk />
        </KeepAlivePane>
      ) : null}
      {seenOutbound ? (
        <KeepAlivePane active={showOutbound}>
          <OutboundDesk />
        </KeepAlivePane>
      ) : null}
      {seenCrm ? (
        <KeepAlivePane active={showCrm}>
          <OperatorShell active="leads" role="owner" title="CRM" compact width="full">
            <Suspense fallback={<DeskLoading label="Loading leads…" />}>
              <LeadsPanel />
            </Suspense>
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenFinances ? (
        <KeepAlivePane active={showFinances}>
          <OperatorShell title="Finances" subtitle="Expenses with source records">
            <FinancesBoard />
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenInstalls ? (
        <KeepAlivePane active={showInstalls}>
          <OperatorShell
            title="Installs"
            subtitle="Configure each client system from intake to monitored lead delivery."
            width="full"
          >
            <InstallKanban />
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenRetention ? (
        <KeepAlivePane active={showRetention}>
          <OperatorShell
            title="Retention"
            subtitle="Monday review. Drafts only. Approve, skip, or call the save play."
            width="6xl"
          >
            <CsDeptBoard />
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
    </>
  )
}
