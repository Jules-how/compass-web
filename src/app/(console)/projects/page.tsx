import { OperatorShell } from '@/components/OperatorShell'
import { ProjectsPanel } from '@/components/ProjectsPanel'

export default function ProjectsPage() {
  return (
    <OperatorShell title="Projects" subtitle="Board, list, and timeline" width="full">
      <ProjectsPanel />
    </OperatorShell>
  )
}
