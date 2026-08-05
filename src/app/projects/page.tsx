import { OperatorShell } from '@/components/OperatorShell'
import { ProjectsPanel } from '@/components/ProjectsPanel'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  await requireOperatorPageAccess()

  return (
    <OperatorShell
      active="projects"
      role="owner"
      title="Projects"
      subtitle="All projects · health, issues, and progress"
    >
      <ProjectsPanel />
    </OperatorShell>
  )
}
