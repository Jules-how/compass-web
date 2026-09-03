'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CampaignPlanner } from '@/components/campaigns/CampaignPlanner'
import { OperatorShell } from '@/components/OperatorShell'
import { CadenceControl, useCadencePrefs } from '@/components/outbound/CadenceControl'
import { CassettePreview } from '@/components/outbound/mock/CassettePreview'
import { FactoryPreview } from '@/components/outbound/mock/FactoryPreview'
import { OutboundDeskSwitch } from '@/components/outbound/OutboundDeskSwitch'
import { OfferWavesBoard } from '@/components/outbound/OfferWavesBoard'
import { PathwayDesk } from '@/components/outbound/PathwayDesk'
import { RunwayPreview } from '@/components/outbound/mock/RunwayPreview'
import { CAMPAIGNS_QUERY_KEY } from '@/lib/campaigns-client'
import { dateOnlyInZone, type CompassCampaign } from '@/lib/campaigns'
import { mondayOfWeek, mondayWeeksAhead } from '@/lib/campaign-queue'
import {
  DEFAULT_OUTBOUND_DESK,
  readOutboundDesk,
  writeOutboundDesk,
  type OutboundDeskId
} from '@/lib/outbound-desk'
import { useCachedJson } from '@/lib/use-cached-json'

type CampaignsPayload = { campaigns: CompassCampaign[] }

function campaignDateOnly(campaign: CompassCampaign): string | null {
  if (campaign.go_live_at) return dateOnlyInZone(campaign.go_live_at)
  const start = (campaign.start_date || '').trim()
  return start ? start.slice(0, 10) : null
}

export function OutboundDesk() {
  const [desk, setDeskState] = useState<OutboundDeskId>(DEFAULT_OUTBOUND_DESK)
  const [ready, setReady] = useState(false)
  const [prefs, setPrefs] = useCadencePrefs()
  const campaignsQuery = useCachedJson<CampaignsPayload>(CAMPAIGNS_QUERY_KEY, '/api/campaigns', {
    staleMs: 30_000
  })

  useEffect(() => {
    setDeskState(readOutboundDesk())
    setReady(true)
  }, [])

  const setDesk = useCallback((next: OutboundDeskId) => {
    setDeskState(writeOutboundDesk(next))
  }, [])

  const slots = useMemo(() => {
    const today = dateOnlyInZone(new Date().toISOString())
    const thisMonday = mondayOfWeek(today)
    const nextMonday = mondayWeeksAhead(today, 1)
    return (campaignsQuery.data?.campaigns ?? []).filter((campaign) => {
      const dateOnly = campaignDateOnly(campaign)
      return Boolean(dateOnly && dateOnly >= thisMonday && dateOnly < nextMonday)
    }).length
  }, [campaignsQuery.data])

  const switcher = <OutboundDeskSwitch value={desk} onChange={setDesk} />

  if (!ready) {
    return <OperatorShell title="Outbound" width="full">{null}</OperatorShell>
  }

  if (desk === 'calendar') {
    return (
      <OperatorShell flush>
        <CampaignPlanner deskSwitch={switcher} />
      </OperatorShell>
    )
  }

  return (
    <OperatorShell
      title="Outbound"
      width="full"
      actions={
        <div className="flex flex-wrap items-end gap-3">
          {switcher}
          <CadenceControl slots={slots} prefs={prefs} onChange={setPrefs} />
          <Link
            href="/sales/outbound/craft"
            className="compass-btn-secondary !px-3 !py-1.5 text-[12px]"
          >
            Craft
          </Link>
        </div>
      }
    >
      {desk === 'waves' ? <OfferWavesBoard /> : null}
      {desk === 'pathways' ? <PathwayDesk /> : null}
      {desk === 'cassette' ? (
        <CassettePreview embedded prefs={prefs} onPrefs={setPrefs} />
      ) : null}
      {desk === 'runway' ? (
        <RunwayPreview embedded prefs={prefs} onPrefs={setPrefs} />
      ) : null}
      {desk === 'factory' ? (
        <FactoryPreview embedded prefs={prefs} onPrefs={setPrefs} />
      ) : null}
    </OperatorShell>
  )
}
