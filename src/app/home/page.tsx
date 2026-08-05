import { OperatorShell } from '@/components/OperatorShell'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  await requireOperatorPageAccess()

  return (
    <OperatorShell
      active="home"
      role="owner"
      title="Home"
      subtitle="Operator home · shortcuts and focus for the day"
    >
      <div className="compass-panel p-6 text-sm text-neutral-600">
        Home is a lightweight landing surface. Jump to{' '}
        <a className="font-medium text-sf-orange-dark hover:underline" href="/tasks">
          My Tasks
        </a>
        ,{' '}
        <a className="font-medium text-sf-orange-dark hover:underline" href="/inbox">
          Inbox
        </a>
        , or{' '}
        <a className="font-medium text-sf-orange-dark hover:underline" href="/sales/pipeline">
          Campaign Planner
        </a>
        .
      </div>
    </OperatorShell>
  )
}
