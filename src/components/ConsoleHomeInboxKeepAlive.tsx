'use client'

import { Suspense, useEffect, useState } from 'react'
import { CampaignPlanner } from '@/components/campaigns/CampaignPlanner'
import { HomeDashboard } from '@/components/home/HomeDashboard'
import { InboxPanel } from '@/components/InboxPanel'
import { LeadsPanel } from '@/components/LeadsPanel'
import { LoadingBlock } from '@/components/LoadingBlock'
import { OperatorShell } from '@/components/OperatorShell'
import { OutboundPageClient } from '@/components/outbound/OutboundPageClient'
import { SalesOverview } from '@/components/sales/SalesOverview'
import { keepAliveKey, useConsoleViewPath } from '@/components/ConsoleNav'
import { cn } from '@/lib/utils'

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
 * Keeps Home, Inbox, and the Sales surfaces mounted after first visit so
 * switching between them is instant (no remount, no fade, no waiting on RSC).
 */
export function ConsoleHomeInboxKeepAlive() {
  const viewPath = useConsoleViewPath()
  const key = keepAliveKey(viewPath)
  const showHome = key === 'home'
  const showInbox = key === 'inbox'
  const showOverview = key === 'sales'
  const showPipeline = key === 'pipeline'
  const showOutbound = key === 'outbound'
  const showCrm = key === 'leads'
  const seenHome = useSeen(showHome)
  const seenInbox = useSeen(showInbox)
  const seenOverview = useSeen(showOverview)
  const seenPipeline = useSeen(showPipeline)
  const seenOutbound = useSeen(showOutbound)
  const seenCrm = useSeen(showCrm)

  if (
    !seenHome &&
    !seenInbox &&
    !seenOverview &&
    !seenPipeline &&
    !seenOutbound &&
    !seenCrm
  ) {
    return null
  }

  return (
    <>
      {seenHome ? (
        <KeepAlivePane active={showHome}>
          {/* HomeDashboard owns its own padding / one-viewport layout. */}
          <main className="flex min-h-0 flex-1 flex-col">
            <HomeDashboard />
          </main>
        </KeepAlivePane>
      ) : null}
      {seenInbox ? (
        <KeepAlivePane active={showInbox}>
          <main className="flex h-[100dvh] min-h-0 flex-1 flex-col md:h-auto">
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center p-6">
                  <LoadingBlock label="Loading inbox…" />
                </div>
              }
            >
              <InboxPanel />
            </Suspense>
          </main>
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
      {seenPipeline ? (
        <KeepAlivePane active={showPipeline}>
          <OperatorShell title="Campaign Planner" flush>
            <CampaignPlanner />
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
      {seenOutbound ? (
        <KeepAlivePane active={showOutbound}>
          <OutboundPageClient />
        </KeepAlivePane>
      ) : null}
      {seenCrm ? (
        <KeepAlivePane active={showCrm}>
          <OperatorShell active="leads" role="owner" title="Leads" compact width="full">
            <Suspense fallback={<LoadingBlock label="Loading leads…" />}>
              <LeadsPanel />
            </Suspense>
          </OperatorShell>
        </KeepAlivePane>
      ) : null}
    </>
  )
}
