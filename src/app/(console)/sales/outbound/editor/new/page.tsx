import { OperatorShell } from '@/components/OperatorShell'
import { SequenceEditor } from '@/components/outbound/SequenceEditor'

export default function OutboundEditorNewPage() {
  return (
    <OperatorShell
      title="Sequence editor"
      subtitle="Unbound draft — attach to a campaign when ready"
      width="full"
    >
      <SequenceEditor unbound />
    </OperatorShell>
  )
}
