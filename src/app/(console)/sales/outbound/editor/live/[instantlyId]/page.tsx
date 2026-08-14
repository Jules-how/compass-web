'use client'

import { use } from 'react'
import { OperatorShell } from '@/components/OperatorShell'
import { SequenceEditor } from '@/components/outbound/SequenceEditor'

export default function OutboundLiveUnboundEditorPage({
  params
}: {
  params: Promise<{ instantlyId: string }>
}) {
  const { instantlyId } = use(params)
  return (
    <OperatorShell flush width="full">
      <SequenceEditor instantlyCampaignId={instantlyId} variant="page" />
    </OperatorShell>
  )
}
