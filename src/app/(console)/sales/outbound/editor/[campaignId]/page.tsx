import { OperatorShell } from '@/components/OperatorShell'
import { SequenceEditor } from '@/components/outbound/SequenceEditor'

export default async function OutboundEditorCampaignPage({
  params
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  return (
    <OperatorShell
      title="Sequence editor"
      subtitle="Campaign-owned sequence draft"
      width="full"
    >
      <SequenceEditor campaignId={campaignId} />
    </OperatorShell>
  )
}
