import { Suspense } from 'react'
import { OperatorShell } from '@/components/OperatorShell'
import { LeadsPanel } from '@/components/LeadsPanel'
import { LoadingBlock } from '@/components/LoadingBlock'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  await requireOperatorPageAccess()

  return (
    <OperatorShell
      active="leads"
      role="owner"
      title="Leads"
      subtitle="Outbound lead list"
    >
      <Suspense fallback={<LoadingBlock label="Loading leads…" />}>
        <LeadsPanel />
      </Suspense>
    </OperatorShell>
  )
}
