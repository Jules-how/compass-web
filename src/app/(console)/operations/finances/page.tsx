import { FinancesBoard } from '@/components/finances/FinancesBoard'
import { OperatorShell } from '@/components/OperatorShell'

export default function FinancesPage() {
  return (
    <OperatorShell title="Finances" subtitle="QuickBooks is the only ledger">
      <FinancesBoard />
    </OperatorShell>
  )
}
