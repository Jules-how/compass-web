import { OperatorShell } from '@/components/OperatorShell'
import { LibraryBrowser } from '@/components/outbound/LibraryBrowser'

export default function OutboundOffersPage() {
  return (
    <OperatorShell title="Offers" subtitle="Outbound copy library" width="full">
      <LibraryBrowser kind="offers" />
    </OperatorShell>
  )
}
