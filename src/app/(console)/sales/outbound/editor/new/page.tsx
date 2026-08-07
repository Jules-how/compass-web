'use client'

import { OperatorShell } from '@/components/OperatorShell'
import { SequenceEditor } from '@/components/outbound/SequenceEditor'

export default function OutboundEditorNewPage() {
  return (
    <OperatorShell flush width="full">
      <SequenceEditor unbound variant="page" />
    </OperatorShell>
  )
}
