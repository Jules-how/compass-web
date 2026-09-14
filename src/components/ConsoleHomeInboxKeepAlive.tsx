'use client'

import { ConsolePaneBoundary } from '@/components/ConsolePaneBoundary'
import { ActivePane } from '@/components/ActivePane'
import { loadHomeDashboard, loadInboxPanel, loadSalesOverview, loadOffersDesk, loadOutboundDesk, loadLeadsPanel, loadTasksPanel, loadProjectsPanel, loadFunctionsPanel, loadClientsPanel, loadExpenseBoard, loadInstallKanban, loadCsDeptBoard, loadPlanningDesk, loadOutboundRhythm } from '@/lib/console-destinations'
import dynamic from 'next/dynamic'
import { Suspense, useEffect, useState } from 'react'
import { keepAliveKey, recordPaneVisibleFrame, useConsoleViewPath } from '@/components/ConsoleNav'
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
  loadHomeDashboard,
  { loading: () => <DeskLoading label="Loading home…" /> }
)
const InboxPanel = dynamic(
  loadInboxPanel,
  { loading: () => <DeskLoading label="Loading inbox…" /> }
)
const SalesOverview = dynamic(
  loadSalesOverview,
  { loading: () => <DeskLoading label="Loading sales…" /> }
)
const OffersDesk = dynamic(
  loadOffersDesk,
  { loading: () => <DeskLoading label="Loading offers…" /> }
)
const OutboundDesk = dynamic(
  loadOutboundDesk,
  { loading: () => <DeskLoading label="Loading outbound…" /> }
)
const LeadsPanel = dynamic(
  loadLeadsPanel,
  { loading: () => <DeskLoading label="Loading leads…" /> }
)
const TasksPanel = dynamic(
  loadTasksPanel,
  { loading: () => <DeskLoading label="Loading tasks…" /> }
)
const ProjectsPanel = dynamic(
  loadProjectsPanel,
  { loading: () => <DeskLoading label="Loading projects…" /> }
)
const FunctionsPanel = dynamic(
  loadFunctionsPanel,
  { loading: () => <DeskLoading label="Loading functions…" /> }
)
const ClientsPanel = dynamic(
  loadClientsPanel,
  { loading: () => <DeskLoading label="Loading clients…" /> }
)
const FinancesBoard = dynamic(
  loadExpenseBoard,
  { loading: () => <DeskLoading label="Loading finances…" /> }
)
const InstallKanban = dynamic(
  loadInstallKanban,
  { loading: () => <DeskLoading label="Loading installs…" /> }
)
const CsDeptBoard = dynamic(
  loadCsDeptBoard,
  { loading: () => <DeskLoading label="Loading retention…" /> }
)

const PlanningDesk = dynamic(loadPlanningDesk, { loading: () => <DeskLoading label="Loading planning…" /> })
const OutboundRhythm = dynamic(loadOutboundRhythm, { loading: () => <DeskLoading label="Loading outreach…" /> })

function KeepAlivePane({
  paneKey,
  active,
  className,
  children
}: {
  paneKey: string
  active: boolean
  className?: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!active) return
    window.dispatchEvent(new Event('resize'))
    return recordPaneVisibleFrame(paneKey)
  }, [active, paneKey])

  return (
    <div
      className={cn(active ? 'flex min-h-full flex-1 flex-col' : 'hidden', className)}
      data-console-pane={paneKey}
      data-console-active={active}
      aria-hidden={!active}
      inert={!active ? true : undefined}
    >
      <ConsolePaneBoundary><Suspense fallback={<DeskLoading label="Opening workspace…" />}><ActivePane active={active}>{children}</ActivePane></Suspense></ConsolePaneBoundary>
    </div>
  )
}

function useSeen(active: boolean) {
  const [seen, setSeen] = useState(active)
  useEffect(() => {
    if (active) setSeen(true)
  }, [active])
  return active || seen
}

/**
 * Keeps operator list surfaces mounted after first visit so sidebar switches
 * do not remount or wait on RSC. Heavy desks load on first visit only.
 */
export function ConsoleHomeInboxKeepAlive() {
  const viewPath = useConsoleViewPath()
  const key = keepAliveKey(viewPath)
  const showPlanning = key === 'planning'
  const showRhythm = key === 'rhythm'
  const seenPlanning = useSeen(showPlanning)
  const seenRhythm = useSeen(showRhythm)
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
    !seenPlanning && !seenRhythm &&
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
      {seenPlanning ? <KeepAlivePane paneKey="planning" active={showPlanning}><Suspense fallback={<DeskLoading label="Loading planning…" />}><PlanningDesk /></Suspense></KeepAlivePane> : null}
      {seenRhythm ? <KeepAlivePane paneKey="rhythm" active={showRhythm}><OperatorShell width="full"><OutboundRhythm /></OperatorShell></KeepAlivePane> : null}
      {seenHome ? (
        <KeepAlivePane paneKey="home" active={showHome}>
          <div className="flex min-h-0 flex-1 flex-col">
            <HomeDashboard />
          </div>
        </KeepAlivePane>
      ) : null}
      {seenInbox ? (
        <KeepAlivePane paneKey="inbox" active={showInbox}>
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
        <KeepAlivePane paneKey="tasks" active={showTasks}>
          <OperatorShell title="Tasks" width="full" compact>
            <TasksPanel />
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenProjects ? (
        <KeepAlivePane paneKey="projects" active={showProjects}>
          <OperatorShell title="Projects" width="full" compact>
            <ProjectsPanel />
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenFunctions ? (
        <KeepAlivePane paneKey="functions" active={showFunctions}>
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
        <KeepAlivePane paneKey="clients" active={showClients}>
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
        <KeepAlivePane paneKey="sales" active={showOverview}>
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
        <KeepAlivePane paneKey="offers" active={showOffers}>
          <OffersDesk />
        </KeepAlivePane>
      ) : null}
      {seenOutbound ? (
        <KeepAlivePane paneKey="outbound" active={showOutbound}>
          <OutboundDesk />
        </KeepAlivePane>
      ) : null}
      {seenCrm ? (
        <KeepAlivePane paneKey="leads" active={showCrm}>
          <OperatorShell active="leads" role="owner" title="CRM" compact width="full">
            <Suspense fallback={<DeskLoading label="Loading leads…" />}>
              <LeadsPanel />
            </Suspense>
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenFinances ? (
        <KeepAlivePane paneKey="finances" active={showFinances}>
          <OperatorShell title="Finances" subtitle="Expenses with source records">
            <FinancesBoard />
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenInstalls ? (
        <KeepAlivePane paneKey="installs" active={showInstalls}>
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
        <KeepAlivePane paneKey="retention" active={showRetention}>
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
