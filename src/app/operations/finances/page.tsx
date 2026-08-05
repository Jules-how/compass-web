import { OperatorShell } from '@/components/OperatorShell'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

export default async function FinancesPage() {
  await requireOperatorPageAccess()

  return (
    <OperatorShell
      active="finances"
      role="owner"
      title="Finances"
      subtitle="Operations · coming next"
    >
      <div className="compass-panel p-6 text-sm text-neutral-600">
        Finances will land under Operations. This page is a routed stub for the new nav.
      </div>
    </OperatorShell>
  )
}
