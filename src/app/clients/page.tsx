import { OperatorShell } from '@/components/OperatorShell'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  await requireOperatorPageAccess()

  return (
    <OperatorShell
      active="clients"
      role="owner"
      title="Clients"
      subtitle="Client directory · coming next"
    >
      <div className="compass-panel p-6 text-sm text-neutral-600">
        Clients will list delivery and account relationships. Delivery portal stays on its own
        surface.
      </div>
    </OperatorShell>
  )
}
