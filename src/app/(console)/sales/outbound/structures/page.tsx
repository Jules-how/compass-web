import { OperatorShell } from '@/components/OperatorShell'
import { LibraryBrowser } from '@/components/outbound/LibraryBrowser'

export default function OutboundStructuresPage() {
  return (
    <OperatorShell title="Structures" subtitle="Outbound copy library" width="full">
      <LibraryBrowser kind="structures" />
    </OperatorShell>
  )
}
