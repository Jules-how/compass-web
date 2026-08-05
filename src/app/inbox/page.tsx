import { Suspense } from 'react'
import { OperatorShell } from '@/components/OperatorShell'
import { InboxPanel } from '@/components/InboxPanel'
import { LoadingBlock } from '@/components/LoadingBlock'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  await requireOperatorPageAccess()

  return (
    <OperatorShell
      active="inbox"
      role="owner"
      title="Inbox"
      subtitle="Client inbound leads"
    >
      <Suspense fallback={<LoadingBlock label="Loading inbox…" />}>
        <InboxPanel />
      </Suspense>
    </OperatorShell>
  )
}
