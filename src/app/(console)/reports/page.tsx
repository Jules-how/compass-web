import { Suspense } from 'react'
import { OperatorShell } from '@/components/OperatorShell'
import { ReportsWorkspace } from '@/components/ReportsWorkspace'
import { LoadingBlock } from '@/components/LoadingBlock'

export default function ReportsPage() {
  return <OperatorShell width="full" compact><Suspense fallback={<LoadingBlock label="Loading reports…" />}><ReportsWorkspace /></Suspense></OperatorShell>
}
