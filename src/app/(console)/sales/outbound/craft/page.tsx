import { OperatorShell } from '@/components/OperatorShell'
import { OutboundPageClient } from '@/components/outbound/OutboundPageClient'

export default function OutboundCraftPage() {
  return (
    <OperatorShell width="full">
      <OutboundPageClient />
    </OperatorShell>
  )
}
