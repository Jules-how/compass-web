import { CampaignDetail } from '@/components/campaigns/CampaignDetail'
import { OperatorShell } from '@/components/OperatorShell'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const { id } = await params

  return (
    <OperatorShell title="Campaign" subtitle="Properties, milestones, progress, and activity" width="6xl">
      <CampaignDetail campaignId={id} />
    </OperatorShell>
  )
}
