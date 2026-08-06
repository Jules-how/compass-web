import { Suspense } from 'react'
import { OperatorShell } from '@/components/OperatorShell'
import { LeadsPanel } from '@/components/LeadsPanel'
import { LoadingBlock } from '@/components/LoadingBlock'

export default function LeadsPage() {
  return (
    <OperatorShell flush>
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center p-8">
              <LoadingBlock label="Loading leads…" />
            </div>
          }
        >
          <LeadsPanel />
        </Suspense>
      </div>
    </OperatorShell>
  )
}
