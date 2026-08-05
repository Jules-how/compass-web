import { OperatorShell } from '@/components/OperatorShell'
import { FunctionsPanel } from '@/components/FunctionsPanel'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

export default async function FunctionsPage() {
  await requireOperatorPageAccess()

  return (
    <OperatorShell
      active="functions"
      role="owner"
      title="Functions"
      subtitle="Business functions"
    >
      <FunctionsPanel />
    </OperatorShell>
  )
}
