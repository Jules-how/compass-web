import { OperatorShell } from '@/components/OperatorShell'
import { ProjectsPanel } from '@/components/ProjectsPanel'

export default function ProjectsPage() {
  return (
    <OperatorShell title="Projects" width="full" compact>
      <ProjectsPanel />
    </OperatorShell>
  )
}
