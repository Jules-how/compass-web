import { OperatorShell } from '@/components/OperatorShell'
import { FunctionDetailPanel } from '@/components/FunctionDetailPanel'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function FunctionDetailPage({ params }: PageProps) {
  const { id } = await params

  return (
    <OperatorShell
      title="Function"
      subtitle="Projects and tasks for this business module"
      width="full"
    >
      <FunctionDetailPanel functionId={id} />
    </OperatorShell>
  )
}
