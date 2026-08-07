import { OperatorShell } from '@/components/OperatorShell'
import { LibraryBrowser } from '@/components/outbound/LibraryBrowser'

export default function OutboundSubjectsPage() {
  return (
    <OperatorShell title="Subjects" subtitle="Outbound copy library" width="full">
      <LibraryBrowser kind="subjects" />
    </OperatorShell>
  )
}
