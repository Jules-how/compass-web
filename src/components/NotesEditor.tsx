'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CompassTask, CompassTaskNoteRevision } from '@/lib/types'

interface NotesEditorProps {
  task: CompassTask
}

export default function NotesEditor({ task }: NotesEditorProps) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<CompassTaskNoteRevision[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  async function handleSubmit() {
    if (!body.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${task.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body })
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? `Add note failed (${res.status})`)
      }
      const entry = (await res.json()) as CompassTaskNoteRevision
      setBody('')
      if (history) setHistory([...history, entry])
      setSavedAt(new Date().toLocaleTimeString())
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleHistory() {
    if (history) {
      setHistory(null)
      return
    }
    setLoadingHistory(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${task.id}/notes`)
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? `Fetch failed (${res.status})`)
      }
      const data = (await res.json()) as CompassTaskNoteRevision[]
      setHistory(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingHistory(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-neutral-800">Context notes</h3>
        <button
          type="button"
          onClick={handleHistory}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100"
        >
          {history ? 'Hide history' : loadingHistory ? 'Loading…' : 'History'}
        </button>
        {savedAt && <span className="ml-auto text-xs text-neutral-400">Added at {savedAt}</span>}
      </div>

      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Add a new context note…"
        rows={4}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sf-orange focus:outline-none focus:ring-1 focus:ring-sf-orange"
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !body.trim()}
          className="rounded-md bg-sf-orange px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sf-orange-dark disabled:opacity-60"
        >
          {saving ? 'Adding…' : 'Add note'}
        </button>
      </div>

      {history && (
        <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-3">
          <h4 className="mb-2 text-xs font-medium text-neutral-500">
            Note history ({history.length})
          </h4>
          {history.length === 0 ? (
            <p className="text-xs text-neutral-400">No saved revisions yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((rev) => (
                <li key={rev.id} className="border-l-2 border-sf-orange-light pl-2">
                  <div className="text-xs text-neutral-400">
                    {new Date(rev.created_at).toLocaleString()} · {rev.actor} · {rev.source}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
                    {rev.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
