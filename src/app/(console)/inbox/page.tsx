import { Suspense } from 'react'
import { OperatorShell } from '@/components/OperatorShell'
import { InboxPanel } from '@/components/InboxPanel'
import { LoadingBlock } from '@/components/LoadingBlock'

export default function InboxPage() {
  return (
    <OperatorShell title="Inbox" subtitle="Client inbound leads">
      <Suspense fallback={<LoadingBlock label="Loading inbox…" />}>
        <InboxPanel />
      </Suspense>
    </OperatorShell>
  )
}
