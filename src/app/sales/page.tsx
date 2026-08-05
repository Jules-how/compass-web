import { OperatorShell } from '@/components/OperatorShell'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

export default async function SalesOverviewPage() {
  await requireOperatorPageAccess()

  return (
    <OperatorShell
      active="sales-overview"
      role="owner"
      title="Sales"
      subtitle="Overview · pipeline health and campaign signals"
    >
      <div className="compass-panel space-y-3 p-6 text-sm text-neutral-600">
        <p>Sales overview will summarize campaign throughput and outbound health.</p>
        <p>
          Open the{' '}
          <a className="font-medium text-sf-orange-dark hover:underline" href="/sales/pipeline">
            Campaign Planner
          </a>{' '}
          to schedule cold email campaigns on a timeline.
        </p>
      </div>
    </OperatorShell>
  )
}
