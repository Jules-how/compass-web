import { OperatorShell } from '@/components/OperatorShell'
import { TasksPanel } from '@/components/TasksPanel'

export default function TasksPage() {
  return (
    <OperatorShell title="My issues" subtitle="Focus by day and week · scored by value signals" width="3xl">
      <TasksPanel />
    </OperatorShell>
  )
}
