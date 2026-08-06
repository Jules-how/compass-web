import { OperatorShell } from '@/components/OperatorShell'
import { FunctionsPanel } from '@/components/FunctionsPanel'

export default function FunctionsPage() {
  return (
    <OperatorShell title="Functions" subtitle="Business functions">
      <FunctionsPanel />
    </OperatorShell>
  )
}
