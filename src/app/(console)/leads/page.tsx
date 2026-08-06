import { Suspense } from 'react'
import { OperatorShell } from '@/components/OperatorShell'
import { LeadsPanel } from '@/components/LeadsPanel'
import { LoadingBlock } from '@/components/LoadingBlock'

export default function LeadsPage() {
  return (
    <OperatorShell flush>
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center p-8">
            <LoadingBlock label="Loading leads…" />
          </div>
        }
      >
        <LeadsPanel />
      </Suspense>
    </OperatorShell>
  )
}
