import { OperatorShell } from '@/components/OperatorShell'
import { ProjectsPanel } from '@/components/ProjectsPanel'

export default function ProjectsPage() {
  return (
    <OperatorShell
      title="Projects"
      subtitle="List, board, and timeline · health, filters, milestones"
      width="full"
    >
      <ProjectsPanel />
    </OperatorShell>
  )
}
