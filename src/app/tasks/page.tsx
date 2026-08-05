import { OperatorShell } from '@/components/OperatorShell'
import { TasksPanel } from '@/components/TasksPanel'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  await requireOperatorPageAccess()

  return (
    <OperatorShell
      active="tasks"
      role="owner"
      title="My issues"
      subtitle="Operator task list"
      width="3xl"
    >
      <TasksPanel />
    </OperatorShell>
  )
}
