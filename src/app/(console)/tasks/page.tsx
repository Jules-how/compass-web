import { OperatorShell } from '@/components/OperatorShell'
import { TasksPanel } from '@/components/TasksPanel'

export default function TasksPage() {
  return (
    <OperatorShell
      title="My Tasks"
      subtitle="Today · week · focus · backlog · done"
      width="6xl"
    >
      <TasksPanel />
    </OperatorShell>
  )
}
