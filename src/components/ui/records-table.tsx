'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Briefcase,
  Building2,
  Check,
  Clock,
  ExternalLink,
  Heart,
  Link2,
  Mail,
  MapPin,
  Minus,
  Phone,
  Sparkles,
  Tag as TagIcon,
  User,
  FileText,
  Globe,
  CircleDot
} from 'lucide-react'
import { LeadColumnPicker } from '@/components/LeadColumnPicker'
import {
  columnWidth,
  LEAD_COLUMN_DEFS,
  MIN_LEAD_COLUMN_WIDTH,
  MAX_LEAD_COLUMN_WIDTH,
  type LeadColumnId,
  type LeadColumnPreset
} from '@/lib/lead-columns'
import {
  leadColumnValue,
  type Strength
} from '@/lib/lead-records'
import type { LeadContact } from '@/lib/types'

export type { Strength }

export const STRENGTH: Record<
  Strength,
  { label: string; color: string; rank: number }
> = {
  strong: { label: 'Very strong', color: 'var(--records-green)', rank: 3 },
  weak: { label: 'Weak', color: 'var(--records-orange)', rank: 2 },
  veryweak: { label: 'Very weak', color: 'var(--records-red)', rank: 1 },
  none: { label: 'No communication', color: 'var(--records-ink-3)', rank: 0 }
}

const TAG_COLORS: Record<string, string> = {
  'Mortgage brokers': '#3f78ff',
  Broker: '#3f78ff',
  HVAC: '#f09a2f',
  Electrician: '#f09a2f',
  Plumber: '#16a6c7',
  Recruitment: '#9a5cff',
  Trades: '#25a878',
  Agency: '#ee6572',
  Other: '#7f858d',
  prospeo: '#3f78ff',
  origami: '#c84f9d',
  instantly: '#ef720c',
  csv: '#92b72d',
  B2B: '#f09a2f',
  B2C: '#92b72d'
}

const TAG_FALLBACK = [
  '#f09a2f',
  '#92b72d',
  '#ee6572',
  '#c84f9d',
  '#16a6c7',
  '#9a5cff',
  '#3f78ff',
  '#25a878'
]

const COLUMN_ICONS: Partial<Record<LeadColumnId, ReactNode>> = {
  first_name: <User size={14} strokeWidth={1.8} />,
  last_name: <User size={14} strokeWidth={1.8} />,
  email: <Mail size={14} strokeWidth={1.8} />,
  job_title: <Briefcase size={14} strokeWidth={1.8} />,
  company: <Building2 size={14} strokeWidth={1.8} />,
  location: <MapPin size={14} strokeWidth={1.8} />,
  website: <Globe size={14} strokeWidth={1.8} />,
  linkedin: <Link2 size={14} strokeWidth={1.8} />,
  phone: <Phone size={14} strokeWidth={1.8} />,
  opener: <Sparkles size={14} strokeWidth={1.8} />,
  lead_facts: <FileText size={14} strokeWidth={1.8} />,
  capture_crack: <FileText size={14} strokeWidth={1.8} />,
  hours: <Clock size={14} strokeWidth={1.8} />,
  review_count: <FileText size={14} strokeWidth={1.8} />,
  icp_status: <CircleDot size={14} strokeWidth={1.8} />,
  email_origin: <Mail size={14} strokeWidth={1.8} />,
  status: <CircleDot size={14} strokeWidth={1.8} />,
  categories: <TagIcon size={14} strokeWidth={1.8} />,
  last_touch: <Clock size={14} strokeWidth={1.8} />,
  strength: <Heart size={14} strokeWidth={1.8} />
}

function tagColor(name: string): string {
  if (TAG_COLORS[name]) return TAG_COLORS[name]
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return TAG_FALLBACK[hash % TAG_FALLBACK.length]
}

function Checkbox({
  checked,
  mixed = false,
  onChange,
  label
}: {
  checked: boolean
  mixed?: boolean
  onChange: () => void
  label: string
}) {
  return (
    <label className="records-checkbox" title={label}>
      <input type="checkbox" ref={(input) => { if (input) input.indeterminate = mixed }} checked={checked} onChange={onChange} aria-label={label} />
      <span className={`records-checkbox-box ${checked || mixed ? 'is-active' : ''}`}>
        {mixed ? (
          <Minus size={12} strokeWidth={2.4} />
        ) : checked ? (
          <Check size={12} strokeWidth={2.4} />
        ) : null}
      </span>
    </label>
  )
}

function Tag({ name }: { name: string }) {
  const color = tagColor(name)
  return (
    <span className="records-tag" style={{ '--tag-color': color } as CSSProperties}>
      <span className="records-tag-dot" style={{ background: color }} />
      {name}
    </span>
  )
}

function ResizeHandle({
  columnId,
  onResize
}: {
  columnId: LeadColumnId
  onResize: (id: LeadColumnId, width: number) => void
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    function onMove(event: MouseEvent) {
      if (!drag.current) return
      const next = drag.current.startWidth + (event.clientX - drag.current.startX)
      onResize(
        columnId,
        Math.min(MAX_LEAD_COLUMN_WIDTH, Math.max(MIN_LEAD_COLUMN_WIDTH, Math.round(next)))
      )
    }
    function onUp() {
      drag.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [columnId, onResize])

  return (
    <button
      type="button"
      aria-label={`Resize ${LEAD_COLUMN_DEFS.find((column) => column.id === columnId)?.label || columnId} column. Use left and right arrows.`}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        event.stopPropagation()
        const width = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 140
        onResize(columnId, Math.min(MAX_LEAD_COLUMN_WIDTH, Math.max(MIN_LEAD_COLUMN_WIDTH, Math.round(width + (event.key === 'ArrowRight' ? 16 : -16)))))
      }}
      className="records-resize"
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const th = (event.currentTarget.parentElement as HTMLElement | null)
        drag.current = {
          startX: event.clientX,
          startWidth: th?.getBoundingClientRect().width ?? 140
        }
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
      }}
    />
  )
}

export default function RecordsTable({
  leads,
  columns,
  widths,
  onResizeColumn,
  selected,
  onToggleRow,
  onToggleAll,
  onRowActivate,
  activeId,
  emptyMessage = 'No records match these filters.',
  entityLabel = 'leads',
  rowStart = 1,
  preset = 'crm',
  occupied = [],
  phoneSparse = false,
  onColumnsChange,
  onOpenerChange,
  fill = false
}: {
  leads: LeadContact[]
  columns: LeadColumnId[]
  widths: Partial<Record<LeadColumnId, number>>
  onResizeColumn: (id: LeadColumnId, width: number) => void
  selected: Set<string>
  onToggleRow: (id: string) => void
  onToggleAll: () => void
  onRowActivate?: (id: string) => void
  activeId?: string | null
  emptyMessage?: string
  entityLabel?: string
  rowStart?: number
  preset?: LeadColumnPreset
  occupied?: LeadColumnId[]
  phoneSparse?: boolean
  onColumnsChange?: (next: LeadColumnId[]) => void
  onOpenerChange?: (leadId: string, opener: string) => void
  fill?: boolean
}) {
  const [sort, setSort] = useState<{ key: LeadColumnId | 'index'; dir: 1 | -1 }>({
    key: 'company',
    dir: 1
  })
  const effectiveWidths = widths

  const visibleRows = useMemo(() => {
    return [...leads].sort((a, b) => {
      if (sort.key === 'index') return 0
      if (sort.key === 'strength') {
        const aRank = STRENGTH[leadColumnValue(a, 'strength').strength ?? 'none'].rank
        const bRank = STRENGTH[leadColumnValue(b, 'strength').strength ?? 'none'].rank
        return (aRank - bRank) * sort.dir
      }
      const aText = leadColumnValue(a, sort.key).text
      const bText = leadColumnValue(b, sort.key).text
      return aText.localeCompare(bText) * sort.dir
    })
  }, [leads, sort])

  const allSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.id))
  const partiallySelected =
    !allSelected && visibleRows.some((row) => selected.has(row.id))

  const minWidth =
    84 + columns.reduce((sum, id) => sum + columnWidth(id, effectiveWidths), 0)


  return (
    <div className={`records-shell ${fill ? 'records-shell-fill' : ''}`}>
      <div
        className="records-scroll"
        tabIndex={0}
        aria-label={`${entityLabel} table. Scroll horizontally and vertically to view all columns and records.`}
      >
        <table className="records-table" style={{ width: '100%', minWidth, tableLayout: 'fixed' }}>
          <caption className="sr-only">{entityLabel}. Column sorting applies to this page of records.</caption>
          <colgroup>
            <col style={{ width: 84 }} />
            {columns.map((id) => (
              <col key={id} style={{ width: columnWidth(id, effectiveWidths) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="records-header-cell records-sticky-cell records-index-head">
                <div className="records-company-header">
                  <Checkbox
                    checked={allSelected}
                    mixed={partiallySelected}
                    onChange={onToggleAll}
                    label={`Select all ${entityLabel}`}
                  />
                  <span>#</span>
                </div>
              </th>
              {columns.map((id, index) => {
                const def = LEAD_COLUMN_DEFS.find((col) => col.id === id)
                const active = sort.key === id
                return (
                  <th
                    key={id}
                    scope="col"
                    className={`records-header-cell records-resizable ${id === 'company' ? 'records-identity' : ''}`}
                    aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                    draggable={Boolean(onColumnsChange)}
                    onDragStart={(event) => {
                      if (!onColumnsChange) return
                      if ((event.target as HTMLElement).closest('.records-resize')) {
                        event.preventDefault()
                        return
                      }
                      event.dataTransfer.setData('text/plain', id)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(event) => {
                      if (!onColumnsChange) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(event) => {
                      if (!onColumnsChange) return
                      event.preventDefault()
                      const from = event.dataTransfer.getData('text/plain')
                      if (!from || from === id || !columns.includes(from as LeadColumnId)) return
                      const next = columns.filter((column) => column !== from)
                      const at = next.indexOf(id)
                      next.splice(at, 0, from as LeadColumnId)
                      onColumnsChange(next)
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      className="records-header-button min-w-0 flex-1"
                      title="Sort this page"
                      onClick={() =>
                        setSort((current) =>
                          current.key === id
                            ? { key: id, dir: (current.dir * -1) as 1 | -1 }
                            : { key: id, dir: 1 }
                        )
                      }
                    >
                      <span className="records-header-icon">{COLUMN_ICONS[id]}</span>
                      <span className="truncate">{def?.label ?? id}</span>
                    </button>
                    {index === columns.length - 1 && onColumnsChange ? (
                      <LeadColumnPicker
                        variant="header"
                        phoneSparse={phoneSparse}
                        preset={preset}
                        occupied={occupied}
                        visible={columns}
                        onChange={onColumnsChange}
                      />
                    ) : null}
                    </div>
                    <ResizeHandle columnId={id} onResize={onResizeColumn} />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="records-empty">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visibleRows.map((lead, index) => {
                const selectedRow = selected.has(lead.id)
                const active = activeId === lead.id
                return (
                  <tr
                    key={lead.id}
                    className={`records-row ${selectedRow ? 'is-selected' : ''} ${
                      active ? 'is-active' : ''
                    }`}
                    onClick={() => onRowActivate?.(lead.id)}
                  >
                    <td className="records-cell records-sticky-cell">
                      <div className="records-company-cell">
                        <span
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            checked={selectedRow}
                            onChange={() => onToggleRow(lead.id)}
                            label={`Select ${lead.name || lead.email || 'lead'}`}
                          />
                        </span>
                        <span className="records-index">{rowStart + index}</span>
                      </div>
                    </td>
                    {columns.map((column) => {
                      const cell = leadColumnValue(lead, column)
                      if (column === 'company' && !cell.text) cell.text = lead.name?.trim() || lead.email?.trim() || lead.phone?.trim() || 'Unnamed record'
                      if (column === 'last_touch' && !lead.last_outbound_at) cell.text = 'No outbound recorded'
                      return (
                        <td
                          key={column}
                          title={column === 'last_touch' ? (lead.last_outbound_at ? `Last outbound: ${new Date(lead.last_outbound_at).toLocaleString()}` : 'No outbound timestamp recorded') : column === 'company' && !lead.company?.trim() ? 'Contact identity; no company recorded' : cell.text || undefined}
                          className={`records-cell ${column === 'company' ? 'records-identity' : ''} ${cell.muted ? 'records-muted' : ''} ${
                            column === 'lead_facts' ? 'records-cell-facts' : ''
                          }`}
                        >
                          {column === 'company' && onRowActivate ? <button type="button" className="crm-open-record" aria-label={`Open ${cell.text}`} onClick={(event) => { event.stopPropagation(); onRowActivate(lead.id) }}>{cell.text}</button> : column === 'opener' && onOpenerChange ? (
                            <OpenerCell
                              leadId={lead.id}
                              value={lead.opener ?? ''}
                              onChange={onOpenerChange}
                            />
                          ) : (
                            <CellBody cell={cell} column={column} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OpenerCell({
  leadId,
  value,
  onChange
}: {
  leadId: string
  value: string
  onChange: (leadId: string, opener: string) => void
}) {
  const [text, setText] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (focused.current) return
    setText(value)
  }, [value, leadId])

  return (
    <textarea
      value={text}
      rows={2}
      aria-label="Personalised first line"
      placeholder="Personalised first line"
      className="records-opener-input"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
      }}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        onChange(leadId, next)
      }}
    />
  )
}

function CellBody({
  cell,
  column
}: {
  cell: ReturnType<typeof leadColumnValue>
  column: LeadColumnId
}) {
  if (column === 'categories') {
    const tags = cell.tags ?? []
    if (tags.length === 0) return <span className="records-muted">—</span>
    return (
      <div className="records-tags">
        {tags.slice(0, 2).map((tag) => (
          <Tag key={tag} name={tag} />
        ))}
        {tags.length > 2 ? <details className="records-tags-more" onClick={(event) => event.stopPropagation()}>
          <summary aria-label={`${tags.length - 2} more categories`}>+{tags.length - 2} more</summary>
          <div>{tags.slice(2).map((tag) => <Tag key={tag} name={tag} />)}</div>
        </details> : null}
      </div>
    )
  }
  if (column === 'strength') {
    const strength = STRENGTH[cell.strength ?? 'none']
    return (
      <span className="records-strength">
        <span className="records-strength-dot" style={{ background: strength.color }} />
        {strength.label}
      </span>
    )
  }
  if ((column === 'phone' || column === 'email') && cell.text) {
    return <a className="records-link" href={`${column === 'phone' ? 'tel:' : 'mailto:'}${cell.text}`} onClick={(event) => event.stopPropagation()}>{cell.text}</a>
  }
  if (cell.href && cell.text) {
    return (
      <a
        className="records-link"
        href={cell.href}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
      >
        {cell.text}
        <ExternalLink size={12} strokeWidth={1.8} />
      </a>
    )
  }
  if (!cell.text) return <span className="records-muted">—</span>
  if (column === 'lead_facts') return <span className="records-facts">{cell.text}</span>
  return <span className="records-clip">{cell.text}</span>
}
