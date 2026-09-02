'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { createCampaign } from '@/lib/campaigns-client'
import {
  TESTING_VARIABLES,
  defaultGoLiveAt,
  dateOnlyInZone,
  testingVariableLabel,
  type CompassCampaign
} from '@/lib/campaigns'
import { LIVE_OUTBOUND_OFFER_KEY } from '@/lib/lead-icp'

export function WaveAddCampaign({
  onCreated
}: {
  onCreated: (campaign: CompassCampaign) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [trade, setTrade] = useState('roofing')
  const [city, setCity] = useState('Sydney')
  const [offerKey, setOfferKey] = useState(LIVE_OUTBOUND_OFFER_KEY)
  const [testingVariable, setTestingVariable] = useState('cta')
  const [summary, setSummary] = useState('')
  const [listSize, setListSize] = useState('150')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const goLive = defaultGoLiveAt()
      const size = Number(listSize)
      const campaign = await createCampaign({
        name: name.trim() || `${trade} ${city}`,
        status: 'planned',
        go_live_at: goLive,
        start_date: dateOnlyInZone(goLive),
        offer_key: offerKey,
        vertical_tags: [trade.trim()].filter(Boolean),
        location_tags: [city.trim()].filter(Boolean),
        testing_variable: testingVariable,
        wave_lane: 'next',
        wave_list_size: Number.isFinite(size) ? size : 150,
        summary: summary.trim() || null,
        hypothesis: summary.trim() || null
      })
      onCreated(campaign)
      setOpen(false)
      setName('')
      setSummary('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="compass-btn-secondary !px-3 !py-1.5 text-[12px]"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {open ? 'Close' : 'Add campaign'}
      </button>
      {open ? (
        <Card
          className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] shadow-soft"
          role="dialog"
          aria-label="Add a campaign"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
        >
          <CardHeader>
            <Badge variant="secondary" size="sm">
              Next campaigns
            </Badge>
            <CardTitle className="text-[15px]">Add a campaign</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 text-[12px]">
            <label className="grid gap-1">
              <span className="text-neutral-500">Name</span>
              <input
                className="compass-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Roofing Sydney 150"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-neutral-500">Trade</span>
                <input className="compass-input" value={trade} onChange={(e) => setTrade(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="text-neutral-500">City</span>
                <input className="compass-input" value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="text-neutral-500">Offer</span>
              <input className="compass-input" value={offerKey} onChange={(e) => setOfferKey(e.target.value)} />
            </label>
            <label className="grid gap-1">
              <span className="text-neutral-500">Testing variable</span>
              <select
                className="compass-input"
                value={testingVariable}
                onChange={(e) => setTestingVariable(e.target.value)}
              >
                {TESTING_VARIABLES.filter((value) => value !== 'none').map((value) => (
                  <option key={value} value={value}>
                    {testingVariableLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-neutral-500">List size</span>
              <input
                className="compass-input"
                value={listSize}
                onChange={(e) => setListSize(e.target.value)}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-neutral-500">Notes</span>
              <textarea
                className="compass-input min-h-16"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="What we are testing and why."
              />
            </label>
            {error ? <p className="text-red-700">{error}</p> : null}
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <button type="button" className="text-[12px] text-neutral-500" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="compass-btn-primary !px-3 !py-1.5 text-[12px]"
            >
              {busy ? 'Saving…' : 'Save to next'}
              <ArrowRight className="ml-1.5 size-3.5" />
            </button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  )
}
