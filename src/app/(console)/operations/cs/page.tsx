import { CsDeptBoard } from '@/components/cs-dept/CsDeptBoard'
import { OperatorShell } from '@/components/OperatorShell'

export default function CsDeptPage() {
  return (
    <OperatorShell
      title="Retention"
      subtitle="Monday review. Drafts only. Approve, skip, or call the save play."
      width="6xl"
    >
      <CsDeptBoard />
    </OperatorShell>
  )
}
