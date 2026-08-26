import { OperatorShell } from '@/components/OperatorShell'
import { FunctionsPanel } from '@/components/FunctionsPanel'

export default function FunctionsPage() {
  return (
    <OperatorShell
      title="Functions"
      subtitle="System map — how modules connect to live routes and tables"
      width="full"
    >
      <FunctionsPanel />
    </OperatorShell>
  )
}
