import { OperatorShell } from '@/components/OperatorShell'
import { FunctionsPanel } from '@/components/FunctionsPanel'

export default function FunctionsPage() {
  return (
    <OperatorShell
      title="Functions"
      subtitle="Business modules — open one to see its projects and tasks"
      width="full"
    >
      <FunctionsPanel />
    </OperatorShell>
  )
}
