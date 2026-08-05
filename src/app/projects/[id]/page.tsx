import { OperatorShell } from '@/components/OperatorShell'
import { ProjectDetailPanel } from '@/components/ProjectDetailPanel'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectDetailPage({ params }: PageProps) {
  await requireOperatorPageAccess()
  const { id } = await params

  return (
    <OperatorShell
      active="projects"
      role="owner"
      title="Project"
      subtitle="Overview, progress, and issues"
      width="6xl"
    >
      <ProjectDetailPanel projectId={id} />
    </OperatorShell>
  )
}
