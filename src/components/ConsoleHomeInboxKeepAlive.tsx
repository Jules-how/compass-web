'use client'

import { Suspense, useEffect, useState } from 'react'
import { HomeDashboard } from '@/components/home/HomeDashboard'
import { InboxPanel } from '@/components/InboxPanel'
import { LoadingBlock } from '@/components/LoadingBlock'
import { useConsoleViewPath } from '@/components/ConsoleNav'
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
  return (
    <div
      className={cn(active ? 'flex min-h-full flex-1 flex-col' : 'hidden', className)}
      aria-hidden={!active}
    >
      {children}
    </div>
  )
}

/**
 * Keeps Home + Inbox mounted after first visit so switching between them is
 * instant (no remount, no Suspense flash, no waiting on RSC).
 */
export function ConsoleHomeInboxKeepAlive() {
  const viewPath = useConsoleViewPath()
  const showHome = viewPath.startsWith('/home')
  const showInbox = viewPath.startsWith('/inbox')
  const [seenHome, setSeenHome] = useState(showHome)
  const [seenInbox, setSeenInbox] = useState(showInbox)

  useEffect(() => {
    if (showHome) setSeenHome(true)
  }, [showHome])

  useEffect(() => {
    if (showInbox) setSeenInbox(true)
  }, [showInbox])

  if (!seenHome && !seenInbox) return null

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
    </>
  )
}
