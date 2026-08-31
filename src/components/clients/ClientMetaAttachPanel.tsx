'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type MetaAttachCopy = {
  primary_texts: string[]
  headlines: string[]
  descriptions: string[]
}

type MetaAttach = {
  id: string
  status: string
  offer_cell: string
  destination_url: string | null
  copy: MetaAttachCopy
  creative_brief: Record<string, unknown>
  canva_design_ids: Record<string, string>
  meta_ids: {
    campaign_id?: string
    adset_id?: string
    creative_ids?: string[]
    ad_ids?: string[]
  }
  review: {
    meta_ad_account_id?: string
    meta_page_id?: string
    exported_image_urls?: string[]
    ai_generated_only?: boolean
    notes?: string
  }
  ads_manager_url?: string | null
  pack_id?: string
  created_at: string
  updated_at: string
}

type MetaAttachPayload = {
  clientId: string
  clientName: string
  packId: string
  packs: string[]
  offerCells: string[]
  attaches: MetaAttach[]
}

interface ClientMetaAttachPanelProps {
  clientId: string
  saving?: boolean
  onBusy?: (busy: boolean) => void
  onError?: (message: string | null) => void
}

function statusTone(status: string): string {
  if (status === 'live') return 'bg-emerald-50 text-emerald-800'
  if (status === 'created_paused') return 'bg-sky-50 text-sky-800'
  if (status === 'briefed') return 'bg-violet-50 text-violet-800'
  if (status === 'archived') return 'bg-stone-100 text-stone-500'
  return 'bg-amber-50 text-amber-800'
}

function linesToText(lines: string[]): string {
  return (lines ?? []).join('\n')
}

function textToLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function ClientMetaAttachPanel({
  clientId,
  saving = false,
  onBusy = () => {},
  onError = () => {}
}: ClientMetaAttachPanelProps) {
  const [data, setData] = useState<MetaAttachPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [offerCell, setOfferCell] = useState('')
  const [primaryText, setPrimaryText] = useState('')
  const [headlinesText, setHeadlinesText] = useState('')
  const [descriptionsText, setDescriptionsText] = useState('')
  const [destinationUrl, setDestinationUrl] = useState('')
  const [canvaSquare, setCanvaSquare] = useState('')
  const [canvaPortrait, setCanvaPortrait] = useState('')
  const [imageUrlsText, setImageUrlsText] = useState('')
  const [adAccountId, setAdAccountId] = useState('')
  const [pageId, setPageId] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const load = useCallback(async () => {
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/meta-attach`, { cache: 'no-store' })
      const body = (await res.json()) as MetaAttachPayload & { error?: string }
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      setData(body)
      if (!offerCell && body.offerCells.length > 0) {
        setOfferCell(body.offerCells[0])
      }
      if (!selectedId && body.attaches.length > 0) {
        setSelectedId(body.attaches[0].id)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [clientId, onError, offerCell, selectedId])

  useEffect(() => {
    void load()
  }, [load])

  const selected = data?.attaches.find((a) => a.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) return
    setPrimaryText(linesToText(selected.copy.primary_texts))
    setHeadlinesText(linesToText(selected.copy.headlines))
    setDescriptionsText(linesToText(selected.copy.descriptions))
    setDestinationUrl(selected.destination_url ?? '')
    setCanvaSquare(selected.canva_design_ids.square ?? '')
    setCanvaPortrait(selected.canva_design_ids.portrait ?? '')
    setImageUrlsText((selected.review.exported_image_urls ?? []).join('\n'))
    setAdAccountId(selected.review.meta_ad_account_id ?? '')
    setPageId(selected.review.meta_page_id ?? '')
  }, [selected])

  async function createDraft() {
    if (!offerCell) {
      onError('Choose an offer cell first')
      return
    }
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/meta-attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_cell: offerCell })
      })
      const body = (await res.json()) as { error?: string; attach?: MetaAttach }
      if (!res.ok) throw new Error(body.error || `Create failed (${res.status})`)
      if (body.attach?.id) setSelectedId(body.attach.id)
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  async function saveDraft() {
    if (!selected) return
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/meta-attach/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          destination_url: destinationUrl,
          copy: {
            primary_texts: textToLines(primaryText),
            headlines: textToLines(headlinesText),
            descriptions: textToLines(descriptionsText)
          },
          canva_design_ids: {
            square: canvaSquare.trim() || undefined,
            portrait: canvaPortrait.trim() || undefined
          },
          review: {
            meta_ad_account_id: adAccountId.trim(),
            meta_page_id: pageId.trim(),
            exported_image_urls: textToLines(imageUrlsText),
            ai_generated_only: false
          }
        })
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || `Save failed (${res.status})`)
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  async function pushPaused() {
    if (!selected) return
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/meta-attach/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'push_paused',
          confirm: true,
          destination_url: destinationUrl,
          copy: {
            primary_texts: textToLines(primaryText),
            headlines: textToLines(headlinesText),
            descriptions: textToLines(descriptionsText)
          },
          canva_design_ids: {
            square: canvaSquare.trim() || undefined,
            portrait: canvaPortrait.trim() || undefined
          },
          review: {
            meta_ad_account_id: adAccountId.trim(),
            meta_page_id: pageId.trim(),
            exported_image_urls: textToLines(imageUrlsText),
            ai_generated_only: false
          }
        })
      })
      const body = (await res.json()) as { error?: string; detail?: string }
      if (!res.ok) throw new Error(body.detail || body.error || `Push failed (${res.status})`)
      setConfirmOpen(false)
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  const readOnly = selected?.status === 'live' || selected?.status === 'created_paused'

  return (
    <Card className="compass-panel border-stone-200 shadow-soft">
      <CardHeader className="pb-3">
        <CardTitle className="compass-page-title text-base">Meta attach</CardTitle>
        <CardDescription className="compass-page-subtitle">
          Draft homeowner lead ads. Push creates everything PAUSED in the client ad account. Activate in Ads Manager only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-stone-500">Loading attach lines…</p> : null}

        {data ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="compass-section-label">Offer cell</span>
                <select
                  className="compass-input min-w-[180px]"
                  value={offerCell}
                  onChange={(e) => setOfferCell(e.target.value)}
                  disabled={saving}
                >
                  {data.offerCells.map((cell) => (
                    <option key={cell} value={cell}>
                      {cell}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="compass-btn-secondary"
                onClick={() => void createDraft()}
                disabled={saving}
              >
                New draft
              </button>
            </div>

            {data.attaches.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.attaches.map((attach) => (
                  <button
                    key={attach.id}
                    type="button"
                    onClick={() => setSelectedId(attach.id)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${
                      selectedId === attach.id
                        ? 'border-stone-400 bg-white shadow-soft'
                        : 'border-stone-200 bg-stone-50'
                    }`}
                  >
                    <span className={`mr-2 rounded-lg px-1.5 py-0.5 ${statusTone(attach.status)}`}>
                      {attach.status}
                    </span>
                    {attach.offer_cell}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">No drafts yet. Pack: {data.packId}</p>
            )}

            {selected ? (
              <div className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm md:col-span-2">
                    <span className="compass-section-label">Destination URL (message-matched LP)</span>
                    <input
                      className="compass-input"
                      value={destinationUrl}
                      onChange={(e) => setDestinationUrl(e.target.value)}
                      disabled={saving || readOnly}
                      placeholder="https://switchflow.agency/lp/client-slug"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="compass-section-label">Meta ad account ID</span>
                    <input
                      className="compass-input"
                      value={adAccountId}
                      onChange={(e) => setAdAccountId(e.target.value)}
                      disabled={saving || readOnly}
                      placeholder="act_123…"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="compass-section-label">Facebook Page ID</span>
                    <input
                      className="compass-input"
                      value={pageId}
                      onChange={(e) => setPageId(e.target.value)}
                      disabled={saving || readOnly}
                      placeholder="Page ID"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="compass-section-label">Primary texts (one per line)</span>
                  <textarea
                    className="compass-input min-h-[88px]"
                    value={primaryText}
                    onChange={(e) => setPrimaryText(e.target.value)}
                    disabled={saving || readOnly}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="compass-section-label">Headlines (one per line, 40 char target)</span>
                  <textarea
                    className="compass-input min-h-[72px]"
                    value={headlinesText}
                    onChange={(e) => setHeadlinesText(e.target.value)}
                    disabled={saving || readOnly}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="compass-section-label">Descriptions (one per line)</span>
                  <textarea
                    className="compass-input min-h-[56px]"
                    value={descriptionsText}
                    onChange={(e) => setDescriptionsText(e.target.value)}
                    disabled={saving || readOnly}
                  />
                </label>

                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <p className="compass-section-label mb-2">Canva design IDs (brand template exports)</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-stone-500">1:1 square</span>
                      <input
                        className="compass-input"
                        value={canvaSquare}
                        onChange={(e) => setCanvaSquare(e.target.value)}
                        disabled={saving || readOnly}
                        placeholder="Canva design ID"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-stone-500">4:5 portrait</span>
                      <input
                        className="compass-input"
                        value={canvaPortrait}
                        onChange={(e) => setCanvaPortrait(e.target.value)}
                        disabled={saving || readOnly}
                        placeholder="Canva design ID"
                      />
                    </label>
                  </div>
                  <label className="mt-3 flex flex-col gap-1 text-sm">
                    <span className="text-xs text-stone-500">
                      Exported image URLs (PNG from Canva — required for push; not AI-only)
                    </span>
                    <textarea
                      className="compass-input min-h-[56px]"
                      value={imageUrlsText}
                      onChange={(e) => setImageUrlsText(e.target.value)}
                      disabled={saving || readOnly}
                      placeholder="https://…/creative-1080.png"
                    />
                  </label>
                </div>

                {selected.creative_brief?.photo_direction ? (
                  <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
                    <p className="compass-section-label mb-1">Creative brief</p>
                    <p>{String(selected.creative_brief.photo_direction)}</p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {!readOnly ? (
                    <button
                      type="button"
                      className="compass-btn-secondary"
                      onClick={() => void saveDraft()}
                      disabled={saving}
                    >
                      Save draft
                    </button>
                  ) : null}
                  {selected.status === 'draft' || selected.status === 'briefed' ? (
                    <button
                      type="button"
                      className="compass-btn-primary"
                      onClick={() => setConfirmOpen(true)}
                      disabled={saving}
                    >
                      Push paused to Meta
                    </button>
                  ) : null}
                  {selected.ads_manager_url ? (
                    <a
                      href={selected.ads_manager_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="compass-btn-ghost inline-flex items-center text-sm"
                    >
                      Open Ads Manager →
                    </a>
                  ) : null}
                </div>

                {confirmOpen ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                    <p className="font-medium text-amber-900">Push paused campaign?</p>
                    <p className="mt-1 text-amber-800">
                      Creates campaign, ad set, creatives, and ads as PAUSED in the client ad account. You review and
                      activate in Meta Ads Manager. Compass will not activate or edit after live.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="compass-btn-primary"
                        onClick={() => void pushPaused()}
                        disabled={saving}
                      >
                        Confirm push
                      </button>
                      <button
                        type="button"
                        className="compass-btn-ghost"
                        onClick={() => setConfirmOpen(false)}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {selected.meta_ids?.campaign_id ? (
                  <p className="text-xs text-stone-500">
                    Meta campaign {selected.meta_ids.campaign_id}
                    {selected.meta_ids.ad_ids?.length
                      ? ` · ${selected.meta_ids.ad_ids.length} ad(s) paused`
                      : ''}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
