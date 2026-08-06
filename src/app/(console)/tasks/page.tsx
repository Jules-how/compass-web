import { OperatorShell } from '@/components/OperatorShell'
import { TasksPanel } from '@/components/TasksPanel'

export default function TasksPage() {
  return (
    <OperatorShell title="My issues" subtitle="Operator task list" width="3xl">
      <TasksPanel />
    </OperatorShell>
  )
}
