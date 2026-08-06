import { OperatorShell } from '@/components/OperatorShell'
import { ProjectDetailPanel } from '@/components/ProjectDetailPanel'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params

  return (
    <OperatorShell title="Project" subtitle="Overview, activity, milestones, and issues" width="6xl">
      <ProjectDetailPanel projectId={id} />
    </OperatorShell>
  )
}
