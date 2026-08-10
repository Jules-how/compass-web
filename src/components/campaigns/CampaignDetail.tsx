'use client'

import { CampaignSidecar } from '@/components/campaigns/CampaignSidecar'

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CampaignSidecar
        campaignId={campaignId}
        variant="page"
        onUpdated={() => {
          /* persisted via /api/campaigns */
        }}
      />
    </div>
  )
}
