import { Suspense } from 'react'
import { OperatorShell } from '@/components/OperatorShell'
import { InboxPanel } from '@/components/InboxPanel'
import { LoadingBlock } from '@/components/LoadingBlock'

export default function InboxPage() {
  return (
    <OperatorShell flush>
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center p-6">
            <LoadingBlock label="Loading inbox…" />
          </div>
        }
      >
        <InboxPanel />
      </Suspense>
    </OperatorShell>
  )
}
