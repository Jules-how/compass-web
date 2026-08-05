import { CampaignPlanner } from '@/components/campaigns/CampaignPlanner'
import { OperatorShell } from '@/components/OperatorShell'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  await requireOperatorPageAccess()

  return (
    <OperatorShell active="pipeline" role="owner" title="Campaign Planner" flush>
      <CampaignPlanner />
    </OperatorShell>
  )
}
