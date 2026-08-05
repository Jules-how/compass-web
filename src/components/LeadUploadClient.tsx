'use client'

import { useCallback, useRef, useState } from 'react'
import Papa from 'papaparse'
import Link from 'next/link'
import type { LeadSourceService, LeadVertical, LeadUploadResult } from '@/lib/types'

const VERTICALS: LeadVertical[] = [
  'hvac',
  'electrician',
  'broker',
  'recruitment',
  'trades',
  'agency',
  'other'
]

const SOURCE_SERVICES: LeadSourceService[] = ['prospeo', 'origami', 'vibe', 'manual', 'other']

type Status = 'idle' | 'parsing' | 'uploading' | 'done' | 'error'

interface ParsedPreview {
  filename: string
  rows: Record<string, string | undefined>[]
  headers: string[]
}

export default function LeadUploadClient() {
  const [vertical, setVertical] = useState<LeadVertical>('other')
  const [sourceService, setSourceService] = useState<LeadSourceService>('prospeo')
  const [parsed, setParsed] = useState<ParsedPreview | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LeadUploadResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setParsed(null)
    setResult(null)
    setError(null)
    setStatus('idle')
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const handleFile = useCallback((file: File) => {
    setResult(null)
    setError(null)
    setStatus('parsing')
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const fatal = res.errors.find((e) => e.type === 'Quotes' || e.type === 'Delimiter')
        if (fatal) {
          setError(`CSV parse error: ${fatal.message}`)
          setStatus('error')
          return
        }
        const rows = res.data.filter((r) =>
          Object.values(r).some((v) => String(v ?? '').trim() !== '')
        )
        if (rows.length === 0) {
          setError('CSV is empty or has no data rows.')
          setStatus('error')
          return
        }
        const headers = res.meta.fields ?? Object.keys(rows[0] ?? {})
        setParsed({ filename: file.name, rows: rows as Record<string, string | undefined>[], headers })
        setStatus('idle')
      },
      error: (err) => {
        setError(err.message)
        setStatus('error')
      }
    })
  }, [])

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  async function handleUpload() {
    if (!parsed) return
    setStatus('uploading')
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/leads/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: parsed.rows,
          vertical,
          sourceService,
          filename: parsed.filename
        })
      })
      const body = (await res.json().catch(() => ({}))) as Partial<LeadUploadResult> & {
        error?: string
      }
      if (!res.ok) {
        throw new Error(body.error ?? `Upload failed (${res.status})`)
      }
      setResult({
        batchId: body.batchId ?? '',
        rowCount: body.rowCount ?? parsed.rows.length,
        imported: body.imported ?? 0,
        dupes: body.dupes ?? 0,
        errors: body.errors ?? []
      })
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  const canUpload = parsed !== null && status !== 'uploading'

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Upload leads</h1>
        <p className="text-sm text-neutral-500">
          Parse a CSV client-side, then import it into the lead cloud mirror. Existing
          emails are deduped against <code>lead_contacts</code>.
        </p>
      </header>

      {/* Step 1: file */}
      <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition ${
            dragOver
              ? 'border-sf-orange bg-sf-orange/5'
              : 'border-neutral-300 hover:border-neutral-400'
          }`}
        >
          <svg
            className="mb-2 h-8 w-8 text-neutral-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          <p className="text-sm font-medium text-neutral-700">
            {parsed ? parsed.filename : 'Drop a CSV here, or click to choose'}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {parsed
              ? `${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'} · ${parsed.headers.length} column${parsed.headers.length === 1 ? '' : 's'}`
              : 'Accepts Prospeo / Origami / Vibe exports and generic CSVs with a header row'}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
        </div>

        {/* Step 2: metadata */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Vertical</span>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value as LeadVertical)}
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
            >
              {VERTICALS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Source service</span>
            <select
              value={sourceService}
              onChange={(e) => setSourceService(e.target.value as LeadSourceService)}
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
            >
              {SOURCE_SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        {parsed && (
          <details className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs">
            <summary className="cursor-pointer font-medium text-neutral-600">
              Preview first 5 rows
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    {parsed.headers.map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-1 font-medium text-neutral-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {parsed.headers.map((h) => (
                        <td key={h} className="whitespace-nowrap px-2 py-1 text-neutral-700">
                          {row[h] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleUpload}
            disabled={!canUpload}
            className="rounded-lg bg-sf-orange px-4 py-2 text-sm font-medium text-white transition hover:bg-sf-orange-dark disabled:opacity-60"
          >
            {status === 'uploading' ? 'Uploading…' : 'Upload'}
          </button>
          {parsed && (
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100"
            >
              Choose a different file
            </button>
          )}
          {status === 'parsing' && <span className="text-sm text-neutral-500">Parsing CSV…</span>}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      {/* Result */}
      {result && (
        <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <h2 className="mb-2 font-semibold text-emerald-900">Import complete</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase text-emerald-700">Rows</dt>
              <dd className="font-medium text-emerald-900">{result.rowCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-emerald-700">Imported</dt>
              <dd className="font-medium text-emerald-900">{result.imported}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-emerald-700">Dupes</dt>
              <dd className="font-medium text-emerald-900">{result.dupes}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-emerald-700">Errors</dt>
              <dd className="font-medium text-emerald-900">{result.errors.length}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-emerald-700">
            Batch id: <code>{result.batchId}</code>
          </p>
          {result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-emerald-800">
                Show {result.errors.length} error{result.errors.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-1 list-inside list-disc text-xs text-emerald-800">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {result.errors.length > 20 && <li>…and {result.errors.length - 20} more</li>}
              </ul>
            </details>
          )}
          <div className="mt-3">
            <Link href="/leads" className="text-sm font-medium text-sf-orange-dark hover:underline">
              View leads →
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}
