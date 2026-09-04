import { OperatorShell } from '@/components/OperatorShell'
import { TasksPanel } from '@/components/TasksPanel'

export default function TasksPage() {
  return (
    <OperatorShell title="My Tasks" subtitle="Todo · doing · blocked · done" width="full">
      <TasksPanel />
    </OperatorShell>
  )
}
