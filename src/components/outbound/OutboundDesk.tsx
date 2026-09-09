'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CampaignPlanner } from '@/components/campaigns/CampaignPlanner'
import { OperatorShell } from '@/components/OperatorShell'
import {
  CadenceControl,
  useCadencePrefs,
} from '@/components/outbound/CadenceControl'
import { OutboundDeskSwitch } from '@/components/outbound/OutboundDeskSwitch'
import { OfferWavesBoard } from '@/components/outbound/OfferWavesBoard'
import { CAMPAIGNS_QUERY_KEY } from '@/lib/campaigns-client'
import { dateOnlyInZone, type CompassCampaign } from '@/lib/campaigns'
import { mondayOfWeek, mondayWeeksAhead } from '@/lib/campaign-queue'
import {
  DEFAULT_OUTBOUND_DESK,
  readOutboundDesk,
  writeOutboundDesk,
  type OutboundDeskId,
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
  const campaignsQuery = useCachedJson<CampaignsPayload>(
    CAMPAIGNS_QUERY_KEY,
    '/api/campaigns',
    {
      staleMs: 30_000,
    },
  )

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
      return Boolean(
        dateOnly && dateOnly >= thisMonday && dateOnly < nextMonday,
      )
    }).length
  }, [campaignsQuery.data])

  const switcher = <OutboundDeskSwitch value={desk} onChange={setDesk} />

  if (!ready) {
    return (
      <OperatorShell title="Outbound" width="full">
        {null}
      </OperatorShell>
    )
  }

  if (desk === 'calendar' || desk === 'timeline') {
    return (
      <OperatorShell flush>
        <CampaignPlanner deskSwitch={switcher} initialView={desk} />
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
          <details className="folio-pace">
            <summary>Weekly pace</summary>
            <div>
              <CadenceControl slots={slots} prefs={prefs} onChange={setPrefs} />
            </div>
          </details>
        </div>
      }
    >
      <OfferWavesBoard />
    </OperatorShell>
  )
}
