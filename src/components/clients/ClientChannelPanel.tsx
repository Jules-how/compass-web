'use client'

import { useMemo, useState } from 'react'
import type {
  CompassClientAdSpend,
  CompassClientChannelNote,
  CompassClientOffer
} from '@/lib/types'
import {
  CLIENT_OFFER_STATUSES,
  clientOfferStatusLabel,
  formatMoney,
  formatRelativeTouch,
  type ClientChannel
} from '@/lib/client-pm'

interface ClientChannelPanelProps {
  clientId: string
  channel: Extract<ClientChannel, 'meta' | 'google'>
  offers: CompassClientOffer[]
  adSpend: CompassClientAdSpend[]
  notes: CompassClientChannelNote[]
  saving: boolean
  onBusy: (busy: boolean) => void
  onError: (message: string | null) => void
  onRefresh: () => Promise<void>
}

export function ClientChannelPanel({
  clientId,
  channel,
  offers,
  adSpend,
  notes,
  saving,
  onBusy,
  onError,
  onRefresh
}: ClientChannelPanelProps) {
  const channelOffers = useMemo(
    () => offers.filter((row) => row.channel === channel),
    [offers, channel]
  )
  const channelSpend = useMemo(
    () => adSpend.filter((row) => row.channel === channel),
    [adSpend, channel]
  )
  const channelNotes = useMemo(
    () => notes.filter((row) => row.channel === channel),
    [notes, channel]
  )

  const spendTotal = useMemo(
    () => channelSpend.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [channelSpend]
  )

  const [offerTitle, setOfferTitle] = useState('')
  const [offerAmount, setOfferAmount] = useState('')
  const [offerDescription, setOfferDescription] = useState('')
  const [spendDate, setSpendDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [spendAmount, setSpendAmount] = useState('')
  const [spendCampaign, setSpendCampaign] = useState('')
  const [spendNotes, setSpendNotes] = useState('')
  const [noteBody, setNoteBody] = useState('')

  async function post(kind: 'offer' | 'ad_spend' | 'note', payload: Record<string, unknown>) {
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, channel, ...payload })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await onRefresh()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  async function remove(kind: 'offer' | 'ad_spend' | 'note', id: string) {
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/channel`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await onRefresh()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  async function patchOffer(id: string, status: string) {
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/channel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'offer', id, status })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await onRefresh()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  const label = channel === 'meta' ? 'Meta' : 'Google'

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="compass-panel p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            {label} spend
          </div>
          <div className="mt-1 font-display text-2xl font-semibold text-neutral-900">
            {formatMoney(spendTotal)}
          </div>
          <div className="text-xs text-neutral-500">{channelSpend.length} logged entries</div>
        </div>
        <div className="compass-panel p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Offers</div>
          <div className="mt-1 font-display text-2xl font-semibold text-neutral-900">
            {channelOffers.length}
          </div>
          <div className="text-xs text-neutral-500">
            {channelOffers.filter((row) => row.status === 'active').length} active
          </div>
        </div>
        <div className="compass-panel p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Notes</div>
          <div className="mt-1 font-display text-2xl font-semibold text-neutral-900">
            {channelNotes.length}
          </div>
          <div className="text-xs text-neutral-500">Channel activity / ideas</div>
        </div>
      </div>

      <section className="compass-panel space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-neutral-800">Offers</h3>
        </div>
        <form
          className="grid gap-2 md:grid-cols-[1fr_120px_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            if (!offerTitle.trim()) return
            void post('offer', {
              title: offerTitle.trim(),
              description: offerDescription.trim() || null,
              amount: offerAmount ? Number(offerAmount) : null,
              status: 'draft'
            }).then(() => {
              setOfferTitle('')
              setOfferAmount('')
              setOfferDescription('')
            })
          }}
        >
          <input
            value={offerTitle}
            onChange={(e) => setOfferTitle(e.target.value)}
            placeholder="Offer title"
            className="compass-input"
            disabled={saving}
          />
          <input
            value={offerAmount}
            onChange={(e) => setOfferAmount(e.target.value)}
            placeholder="Amount"
            type="number"
            step="0.01"
            className="compass-input"
            disabled={saving}
          />
          <button
            type="submit"
            disabled={saving || !offerTitle.trim()}
            className="compass-btn-primary"
          >
            Add offer
          </button>
          <input
            value={offerDescription}
            onChange={(e) => setOfferDescription(e.target.value)}
            placeholder="Description / angle (optional)"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm md:col-span-3"
            disabled={saving}
          />
        </form>
        {channelOffers.length === 0 ? (
          <p className="text-sm text-neutral-500">No offers yet for {label}.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {channelOffers.map((offer) => (
              <li key={offer.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-neutral-900">{offer.title}</div>
                  <div className="text-xs text-neutral-500">
                    {offer.description || 'No description'} · {formatMoney(offer.amount, offer.currency)}
                  </div>
                </div>
                <select
                  value={offer.status}
                  onChange={(e) => void patchOffer(offer.id, e.target.value)}
                  className="rounded border border-neutral-200 px-2 py-1 text-xs"
                  disabled={saving}
                >
                  {CLIENT_OFFER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {clientOfferStatusLabel(status)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void remove('offer', offer.id)}
                  className="text-xs text-red-600"
                  disabled={saving}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="compass-panel space-y-3 p-4">
        <h3 className="text-sm font-medium text-neutral-800">Ad spend log</h3>
        <form
          className="grid gap-2 md:grid-cols-[140px_120px_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            if (!spendDate) return
            void post('ad_spend', {
              spend_date: spendDate,
              amount: spendAmount ? Number(spendAmount) : 0,
              campaign_name: spendCampaign.trim() || null,
              notes: spendNotes.trim() || null
            }).then(() => {
              setSpendAmount('')
              setSpendCampaign('')
              setSpendNotes('')
            })
          }}
        >
          <input
            type="date"
            value={spendDate}
            onChange={(e) => setSpendDate(e.target.value)}
            className="compass-input"
            disabled={saving}
          />
          <input
            type="number"
            step="0.01"
            value={spendAmount}
            onChange={(e) => setSpendAmount(e.target.value)}
            placeholder="Amount"
            className="compass-input"
            disabled={saving}
          />
          <input
            value={spendCampaign}
            onChange={(e) => setSpendCampaign(e.target.value)}
            placeholder="Campaign name"
            className="compass-input"
            disabled={saving}
          />
          <button
            type="submit"
            disabled={saving || !spendDate}
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-stone-50 disabled:opacity-60"
          >
            Log spend
          </button>
          <input
            value={spendNotes}
            onChange={(e) => setSpendNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm md:col-span-4"
            disabled={saving}
          />
        </form>
        {channelSpend.length === 0 ? (
          <p className="text-sm text-neutral-500">No spend logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Amount</th>
                  <th className="px-2 py-2 font-medium">Campaign</th>
                  <th className="px-2 py-2 font-medium">Notes</th>
                  <th className="px-2 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {channelSpend.map((row) => (
                  <tr key={row.id} className="border-t border-stone-100">
                    <td className="px-2 py-2 tabular-nums text-neutral-700">{row.spend_date}</td>
                    <td className="px-2 py-2 tabular-nums text-neutral-900">
                      {formatMoney(row.amount, row.currency)}
                    </td>
                    <td className="px-2 py-2 text-neutral-700">{row.campaign_name || '—'}</td>
                    <td className="px-2 py-2 text-neutral-500">{row.notes || '—'}</td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void remove('ad_spend', row.id)}
                        className="text-xs text-red-600"
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="compass-panel space-y-3 p-4">
        <h3 className="text-sm font-medium text-neutral-800">Notes & activity</h3>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!noteBody.trim()) return
            void post('note', { body: noteBody.trim() }).then(() => setNoteBody(''))
          }}
        >
          <input
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder={`Log a ${label} note, idea, or creative direction…`}
            className="min-w-[220px] flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            disabled={saving}
          />
          <button
            type="submit"
            disabled={saving || !noteBody.trim()}
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-stone-50 disabled:opacity-60"
          >
            Add note
          </button>
        </form>
        {channelNotes.length === 0 ? (
          <p className="text-sm text-neutral-500">No channel notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {channelNotes.map((note) => (
              <li
                key={note.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-stone-100 px-3 py-2 text-sm"
              >
                <div>
                  <div className="text-neutral-800">{note.body}</div>
                  <div className="text-xs text-neutral-400">{formatRelativeTouch(note.created_at)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void remove('note', note.id)}
                  className="text-xs text-red-600"
                  disabled={saving}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
