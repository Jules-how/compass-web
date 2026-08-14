'use client'

import type { ReactNode } from 'react'
import type { LeadContact } from '@/lib/types'
import { formatLeadFactsDetail, parseLeadFacts } from '@/lib/lead-facts'

function humanizeStatus(status: string | null | undefined): string {
  if (!status) return 'Uncontacted'
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-2 border-b border-neutral-100 py-2.5 text-[13px]">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="min-w-0 break-words text-neutral-900">{children || '—'}</dd>
    </div>
  )
}

export function LeadSidecar({
  lead,
  onClose
}: {
  lead: LeadContact
  onClose: () => void
}) {
  const title = lead.name || lead.email || 'Untitled'

  return (
    <aside className="flex h-full w-full max-w-[400px] shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-start gap-3 border-b border-neutral-200 px-4 py-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[12px] font-semibold text-neutral-700">
          {initials(lead.name, lead.email)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-neutral-900">
            {title}
          </h2>
          <p className="mt-0.5 text-[12px] text-neutral-500">
            {humanizeStatus(lead.outbound_status)}
            {lead.company ? ` · ${lead.company}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="m4 4 8 8M12 4 4 12" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
          Record details
        </h3>
        <dl>
          <Field label="Email">
            {lead.email ? (
              <a href={`mailto:${lead.email}`} className="text-[#3b6ef5] hover:underline">
                {lead.email}
              </a>
            ) : null}
          </Field>
          <Field label="Phone">{lead.phone}</Field>
          <Field label="Company">{lead.company}</Field>
          <Field label="Job title">{lead.role}</Field>
          <Field label="Location">
            {[lead.city, lead.state].filter(Boolean).join(', ') || null}
          </Field>
          <Field label="LinkedIn">
            {lead.linkedin ? (
              <a
                href={lead.linkedin.startsWith('http') ? lead.linkedin : `https://${lead.linkedin}`}
                target="_blank"
                rel="noreferrer"
                className="text-[#3b6ef5] hover:underline"
              >
                {lead.linkedin}
              </a>
            ) : null}
          </Field>
          <Field label="Vertical">{lead.vertical}</Field>
          <Field label="Source">{lead.source}</Field>
          <Field label="Status">{humanizeStatus(lead.outbound_status)}</Field>
          <Field label="Interest">{lead.interest_label}</Field>
          <Field label="Campaign">{lead.instantly_campaign_name || lead.instantly_campaign}</Field>
          <Field label="Last outbound">{formatWhen(lead.last_outbound_at)}</Field>
          <Field label="Updated">{formatWhen(lead.updated_at || lead.mirrored_at)}</Field>
        </dl>

        <h3 className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
          Opener
        </h3>
        {lead.opener?.trim() ? (
          <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-[13px] leading-relaxed text-neutral-800">
            {lead.opener.trim()}
          </p>
        ) : (
          <p className="text-[13px] text-neutral-400">No opener yet.</p>
        )}

        <h3 className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
          Research facts
        </h3>
        <FactsList lead={lead} />
      </div>
    </aside>
  )
}

function FactsList({ lead }: { lead: LeadContact }) {
  const parsed = parseLeadFacts(lead.lead_facts)
  const facts = parsed.ok ? parsed.facts : []
  if (facts.length === 0) {
    const fallback = formatLeadFactsDetail(lead.lead_facts)
    if (fallback) {
      return <pre className="whitespace-pre-wrap text-[13px] text-neutral-700">{fallback}</pre>
    }
    return <p className="text-[13px] text-neutral-400">No research facts.</p>
  }
  return (
    <ul className="space-y-2">
      {facts.map((fact, index) => (
        <li
          key={`${fact.kind}-${index}`}
          className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            {fact.kind}
          </div>
          <div className="mt-0.5 text-[13px] text-neutral-800">{fact.claim}</div>
          {fact.url ? (
            <a
              href={fact.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-[12px] text-[#3b6ef5] hover:underline"
            >
              {fact.url}
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
