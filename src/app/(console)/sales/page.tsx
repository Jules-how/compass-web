import { OperatorShell } from '@/components/OperatorShell'
import { SalesOverview } from '@/components/sales/SalesOverview'

export default function SalesOverviewPage() {
  return (
    <OperatorShell
      title="Sales"
      subtitle="Overview · Instantly throughput, targeting map, replies, and deal flow"
      width="full"
    >
      <SalesOverview />
    </OperatorShell>
  )
}
