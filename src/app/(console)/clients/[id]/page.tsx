import { OperatorShell } from '@/components/OperatorShell'
import { ClientDetailPanel } from '@/components/clients/ClientDetailPanel'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params

  return (
    <OperatorShell
      title="Client"
      subtitle="Overview, issues, channels, and projects"
      width="6xl"
    >
      <ClientDetailPanel clientId={id} />
    </OperatorShell>
  )
}
