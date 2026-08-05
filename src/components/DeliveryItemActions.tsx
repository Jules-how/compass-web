'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { DeliveryItemCustomerDto } from '@/lib/portal-contracts'

export default function DeliveryItemActions({ item }: { item: DeliveryItemCustomerDto }) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [changeComment, setChangeComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function send(path: string, body: Record<string, unknown>) {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, operationId: crypto.randomUUID() })
      })
      if (!response.ok) {
        setMessage(response.status === 409 ? 'This item changed. Refresh and try again.' : 'That action could not be completed.')
        return false
      }
      router.refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  async function addComment(event: React.FormEvent) {
    event.preventDefault()
    if (!comment.trim()) return
    if (await send(`/api/delivery/items/${item.id}/comments`, { body: comment })) setComment('')
  }

  async function uploadEvidence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    form.set('operationId', crypto.randomUUID())
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/delivery/items/${item.id}/attachments`, {
        method: 'POST',
        body: form
      })
      if (!response.ok) {
        setMessage('The evidence file could not be attached.')
        return
      }
      event.currentTarget.reset()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const canComplete =
    item.actionOwner === 'client' &&
    ['pending', 'awaiting_client', 'changes_requested'].includes(item.customerState)
  const canDecide = item.reviewable && ['in_review', 'awaiting_client'].includes(item.customerState)

  return (
    <div className="mt-4 space-y-4 border-t border-neutral-100 pt-4">
      <form onSubmit={addComment} className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500">
          Add a comment
        </label>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={4000}
          rows={3}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sf-orange focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !comment.trim()}
          className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add comment
        </button>
      </form>

      <form onSubmit={uploadEvidence} className="flex flex-wrap items-end gap-2">
        <label className="block flex-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Attach evidence
          <input
            name="file"
            type="file"
            required
            accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.docx,.xlsx"
            className="mt-1 block w-full text-sm text-neutral-600"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
        >
          Upload
        </button>
      </form>

      {canComplete && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void send(`/api/delivery/items/${item.id}/complete`, { baseVersion: item.version })
          }
          className="rounded-lg bg-sf-orange px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Mark request complete
        </button>
      )}

      {canDecide && (
        <div className="space-y-2 rounded-lg bg-neutral-50 p-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void send(`/api/delivery/items/${item.id}/decisions`, {
                  baseVersion: item.version,
                  decision: 'approve'
                })
              }
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Approve
            </button>
          </div>
          <textarea
            value={changeComment}
            onChange={(event) => setChangeComment(event.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="What should change?"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sf-orange focus:outline-none"
          />
          <button
            type="button"
            disabled={busy || !changeComment.trim()}
            onClick={() =>
              void send(`/api/delivery/items/${item.id}/decisions`, {
                baseVersion: item.version,
                decision: 'request_changes',
                comment: changeComment
              })
            }
            className="rounded-lg border border-amber-500 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-50"
          >
            Request changes
          </button>
        </div>
      )}

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  )
}
