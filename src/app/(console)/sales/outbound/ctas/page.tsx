import { OperatorShell } from '@/components/OperatorShell'
import { LibraryBrowser } from '@/components/outbound/LibraryBrowser'

export default function OutboundCtasPage() {
  return (
    <OperatorShell title="CTAs" subtitle="Outbound copy library" width="full">
      <LibraryBrowser kind="ctas" />
    </OperatorShell>
  )
}
