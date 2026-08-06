import { CampaignPlanner } from '@/components/campaigns/CampaignPlanner'
import { OperatorShell } from '@/components/OperatorShell'

export default function PipelinePage() {
  return (
    <OperatorShell title="Campaign Planner" flush>
      <CampaignPlanner />
    </OperatorShell>
  )
}
