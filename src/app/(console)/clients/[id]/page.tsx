import { OperatorShell } from '@/components/OperatorShell'
import { ClientsPanel } from '@/components/ClientsPanel'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params

  return (
    <OperatorShell
      title="Clients"
      subtitle="Accounts, relationships, and delivery workspaces"
      width="6xl"
    >
      <ClientsPanel initialClientId={id} />
    </OperatorShell>
  )
}
