import { OperatorShell } from '@/components/OperatorShell'
import { ClientsPanel } from '@/components/ClientsPanel'

export default function ClientsPage() {
  return (
    <OperatorShell
      title="Clients"
      subtitle="Accounts, relationships, and delivery workspaces"
      width="6xl"
    >
      <ClientsPanel />
    </OperatorShell>
  )
}
