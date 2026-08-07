import { OperatorShell } from '@/components/OperatorShell'
import { LibraryBrowser } from '@/components/outbound/LibraryBrowser'

export default function OutboundOpenersPage() {
  return (
    <OperatorShell title="Openers" subtitle="Outbound copy library" width="full">
      <LibraryBrowser kind="openers" />
    </OperatorShell>
  )
}
