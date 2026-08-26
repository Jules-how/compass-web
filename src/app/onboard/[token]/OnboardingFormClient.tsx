'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type FieldOption = { value: string; label: string }

type PackField = {
  id: string
  label: string
  help?: string
  type: string
  required: boolean
  options?: FieldOption[]
}

type PackSection = {
  id: string
  title: string
  description?: string
  fields: PackField[]
}

type FormPayload = {
  status: string
  answers: Record<string, unknown>
  submittedAt?: string | null
  pack: {
    title: string
    subtitle?: string
    sections: PackSection[]
  }
}

const WEEKDAYS = [
  ['monday', 'Mon'],
  ['tuesday', 'Tue'],
  ['wednesday', 'Wed'],
  ['thursday', 'Thu'],
  ['friday', 'Fri'],
  ['saturday', 'Sat'],
  ['sunday', 'Sun']
] as const

function defaultHours() {
  return Object.fromEntries(
    WEEKDAYS.map(([day]) => [day, { open: '07:00', close: '17:00', closed: false }])
  )
}

function FieldInput({
  field,
  value,
  onChange,
  disabled
}: {
  field: PackField
  value: unknown
  onChange: (next: unknown) => void
  disabled?: boolean
}) {
  if (field.type === 'file_note') {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50/90 p-4 text-sm leading-relaxed text-neutral-700">
        {field.help}
      </div>
    )
  }

  if (field.type === 'toggle') {
    const checked = value === true
    return (
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          className="mt-1 h-4 w-4 rounded border-stone-300 text-[var(--compass-accent)]"
        />
        <span className="text-sm leading-relaxed text-neutral-800">{field.label}</span>
      </label>
    )
  }

  if (field.type === 'hours') {
    const hours =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, { open?: string; close?: string; closed?: boolean }>)
        : defaultHours()
    return (
      <div className="space-y-2">
        {WEEKDAYS.map(([day, label]) => {
          const row = hours[day] ?? { open: '07:00', close: '17:00', closed: false }
          return (
            <div
              key={day}
              className="grid grid-cols-[3rem_1fr_1fr_auto] items-center gap-2 text-sm"
            >
              <span className="font-medium text-neutral-600">{label}</span>
              <input
                type="time"
                value={row.closed ? '' : row.open || '07:00'}
                onChange={(event) =>
                  onChange({ ...hours, [day]: { ...row, open: event.target.value, closed: false } })
                }
                disabled={disabled || row.closed}
                className="compass-input py-2"
              />
              <input
                type="time"
                value={row.closed ? '' : row.close || '17:00'}
                onChange={(event) =>
                  onChange({ ...hours, [day]: { ...row, close: event.target.value, closed: false } })
                }
                disabled={disabled || row.closed}
                className="compass-input py-2"
              />
              <label className="flex items-center gap-1 text-xs text-neutral-500">
                <input
                  type="checkbox"
                  checked={row.closed === true}
                  onChange={(event) =>
                    onChange({
                      ...hours,
                      [day]: { ...row, closed: event.target.checked }
                    })
                  }
                  disabled={disabled}
                />
                Closed
              </label>
            </div>
          )
        })}
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="compass-input"
      >
        <option value="">Select…</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={4}
        className="compass-input"
      />
    )
  }

  const inputType = field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'
  return (
    <input
      type={inputType}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="compass-input"
      autoComplete={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'organization'}
    />
  )
}

export function OnboardingFormClient({ token }: { token: string }) {
  const [payload, setPayload] = useState<FormPayload | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [sectionIndex, setSectionIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/onboarding/${encodeURIComponent(token)}`, { cache: 'no-store' })
      const body = (await res.json().catch(() => ({}))) as FormPayload & { error?: string }
      if (!res.ok) throw new Error(body.error || `Failed to load (${res.status})`)
      setPayload(body)
      setAnswers(body.answers ?? {})
      if (body.status === 'submitted') setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('done') === '1') {
      setDone(true)
    }
    void load()
  }, [load])

  const sections = payload?.pack.sections ?? []
  const section = sections[sectionIndex]
  const progress = sections.length ? Math.round(((sectionIndex + 1) / sections.length) * 100) : 0

  const visibleFields = useMemo(
    () => (section?.fields ?? []).filter((field) => field.type !== 'file_note' || field.help),
    [section]
  )

  async function persist(nextAnswers: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/onboarding/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: nextAnswers })
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; answers?: Record<string, unknown> }
      if (!res.ok) throw new Error(body.error || `Save failed (${res.status})`)
      if (body.answers) setAnswers(body.answers)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function goNext() {
    const nextAnswers = { ...answers }
    if (section?.fields.some((f) => f.id === 'business_hours') && !nextAnswers.business_hours) {
      nextAnswers.business_hours = defaultHours()
      setAnswers(nextAnswers)
    }
    try {
      await persist(nextAnswers)
      if (sectionIndex < sections.length - 1) {
        setSectionIndex((value) => value + 1)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {
      // error already set
    }
  }

  async function submitForm() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/onboarding/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        errors?: Array<{ fieldId: string; message: string }>
      }
      if (!res.ok) {
        if (body.errors?.length) {
          throw new Error(body.errors.map((row) => row.message).join(' · '))
        }
        throw new Error(body.error || `Submit failed (${res.status})`)
      }
      setDone(true)
      window.history.replaceState({}, '', `?done=1`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-neutral-500">
        Loading your form…
      </div>
    )
  }

  if (error && !payload) {
    return (
      <div className="compass-panel mx-auto max-w-lg p-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <p className="mt-2 text-xs text-neutral-500">This link may have expired. Ask Switchflow for a new one.</p>
      </div>
    )
  }

  if (done || payload?.status === 'submitted') {
    return (
      <div className="compass-panel mx-auto max-w-lg space-y-3 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          ✓
        </div>
        <h1 className="font-display text-xl font-semibold text-neutral-900">You are all set</h1>
        <p className="text-sm leading-relaxed text-neutral-600">
          Thanks — we have your details. Switchflow will provision your number, configure booking, and send your
          install invoice to the billing email you provided.
        </p>
      </div>
    )
  }

  if (!payload || !section) return null

  const isLast = sectionIndex >= sections.length - 1

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <header className="space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--compass-accent)]">Switchflow</p>
        <h1 className="font-display text-2xl font-semibold text-neutral-900">{payload.pack.title}</h1>
        {payload.pack.subtitle ? (
          <p className="text-sm text-neutral-600">{payload.pack.subtitle}</p>
        ) : null}
      </header>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            Step {sectionIndex + 1} of {sections.length}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-[var(--compass-accent)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <section className="compass-panel space-y-5 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-neutral-900">{section.title}</h2>
          {section.description ? (
            <p className="mt-1 text-sm text-neutral-600">{section.description}</p>
          ) : null}
        </div>

        <div className="space-y-4">
          {visibleFields.map((field) => {
            if (field.type === 'toggle' && field.id === 'authorisation') {
              return (
                <FieldInput
                  key={field.id}
                  field={field}
                  value={answers[field.id]}
                  onChange={(next) => setAnswers((prev) => ({ ...prev, [field.id]: next }))}
                  disabled={saving}
                />
              )
            }
            if (field.type === 'file_note') {
              return <FieldInput key={field.id} field={field} value={null} onChange={() => {}} />
            }
            return (
              <label key={field.id} className="block space-y-1.5">
                <span className="text-sm font-medium text-neutral-800">
                  {field.label}
                  {field.required ? <span className="text-[var(--compass-accent)]"> *</span> : null}
                </span>
                {field.help && field.type !== 'file_note' ? (
                  <span className="block text-xs text-neutral-500">{field.help}</span>
                ) : null}
                <FieldInput
                  field={field}
                  value={answers[field.id]}
                  onChange={(next) => setAnswers((prev) => ({ ...prev, [field.id]: next }))}
                  disabled={saving}
                />
              </label>
            )
          })}
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex flex-wrap gap-2 pt-2">
          {sectionIndex > 0 ? (
            <button
              type="button"
              onClick={() => setSectionIndex((value) => value - 1)}
              disabled={saving}
              className="compass-btn-secondary"
            >
              Back
            </button>
          ) : null}
          {!isLast ? (
            <button type="button" onClick={() => void goNext()} disabled={saving} className="compass-btn-primary ml-auto">
              {saving ? 'Saving…' : 'Continue'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submitForm()}
              disabled={saving}
              className="compass-btn-primary ml-auto"
            >
              {saving ? 'Submitting…' : 'Submit onboarding'}
            </button>
          )}
        </div>
      </section>

      <p className="text-center text-[11px] text-neutral-400">
        Progress saves automatically each step. You can close and return with this link.
      </p>
    </div>
  )
}
