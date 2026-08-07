import { OperatorShell } from '@/components/OperatorShell'
import { LibraryBrowser } from '@/components/outbound/LibraryBrowser'

export default function OutboundTemplatesPage() {
  return (
    <OperatorShell title="Templates" subtitle="Outbound copy library" width="full">
      <LibraryBrowser kind="templates" />
    </OperatorShell>
  )
}
