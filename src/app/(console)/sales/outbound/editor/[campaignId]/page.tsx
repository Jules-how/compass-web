'use client'

import { use } from 'react'
import { OperatorShell } from '@/components/OperatorShell'
import { SequenceEditor } from '@/components/outbound/SequenceEditor'

export default function OutboundEditorCampaignPage({
  params
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = use(params)
  return (
    <OperatorShell flush width="full">
      <SequenceEditor campaignId={campaignId} variant="page" />
    </OperatorShell>
  )
}
