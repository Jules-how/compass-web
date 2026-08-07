import { OperatorShell } from '@/components/OperatorShell'
import { OutboundHub } from '@/components/outbound/OutboundHub'

export default function OutboundPage() {
  return (
    <OperatorShell
      title="Outbound"
      subtitle="Copy libraries · sequence editor · campaign binding"
      width="full"
    >
      <OutboundHub />
    </OperatorShell>
  )
}
