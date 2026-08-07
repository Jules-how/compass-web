import { OperatorShell } from '@/components/OperatorShell'
import { LibraryBrowser } from '@/components/outbound/LibraryBrowser'

export default function OutboundExpressionsPage() {
  return (
    <OperatorShell title="Expressions" subtitle="Outbound copy library" width="full">
      <LibraryBrowser kind="expressions" />
    </OperatorShell>
  )
}
