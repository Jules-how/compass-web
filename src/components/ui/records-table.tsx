'use client'

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowDown,
  Check,
  Clock,
  ExternalLink,
  Heart,
  Link2,
  Minus,
  Plus,
  Tag as TagIcon
} from 'lucide-react'

/* Compact CRM grid: sticky first column, grid lines, tags, selection, sort, footer math. */

export type Strength = 'strong' | 'weak' | 'veryweak' | 'none'
export type SortKey = 'name' | 'last' | 'strength'

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

export type RecordsTableRow = {
  id: string
  name: string
  tags: string[]
  last: string
  lastSort?: number
  strength: Strength
  website?: string
  href?: string
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
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} />
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

function HeaderCell({
  label,
  icon,
  sortKey,
  sort,
  onSort,
  className = ''
}: {
  label: string
  icon: ReactNode
  sortKey?: SortKey
  sort: { key: SortKey; dir: 1 | -1 }
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sortKey && sort.key === sortKey
  return (
    <th className={`records-header-cell ${className}`}>
      <button
        type="button"
        className="records-header-button"
        onClick={sortKey ? () => onSort(sortKey) : undefined}
        aria-sort={
          !sortKey ? undefined : active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'
        }
      >
        <span className="records-header-icon">{icon}</span>
        <span className="truncate">{label}</span>
        {sortKey ? (
          <span
            className={`records-sort ${active ? 'is-visible' : ''}`}
            style={{
              transform: active && sort.dir === -1 ? 'rotate(180deg)' : undefined
            }}
          >
            <ArrowDown size={12} strokeWidth={2} />
          </span>
        ) : null}
      </button>
    </th>
  )
}

export default function RecordsTable({
  rows,
  selected,
  onToggleRow,
  onToggleAll,
  onRowActivate,
  activeId,
  emptyMessage = 'No records match these filters.',
  entityLabel = 'leads'
}: {
  rows: RecordsTableRow[]
  selected: Set<string>
  onToggleRow: (id: string) => void
  onToggleAll: () => void
  onRowActivate?: (id: string) => void
  activeId?: string | null
  emptyMessage?: string
  entityLabel?: string
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: 'name',
    dir: 1
  })

  const visibleRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let value = 0
      if (sort.key === 'name') value = a.name.localeCompare(b.name)
      else if (sort.key === 'last') {
        const aSort = a.lastSort ?? 0
        const bSort = b.lastSort ?? 0
        value = aSort === bSort ? a.last.localeCompare(b.last) : aSort - bSort
      } else {
        value = STRENGTH[a.strength].rank - STRENGTH[b.strength].rank
      }
      return value * sort.dir
    })
  }, [rows, sort])

  const allSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.id))
  const partiallySelected =
    !allSelected && visibleRows.some((row) => selected.has(row.id))

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: (current.dir * -1) as 1 | -1 }
        : { key, dir: 1 }
    )

  const linkCount = rows.filter((row) => row.website).length
  const averagePct =
    rows.length === 0
      ? 0
      : Math.round(
          (rows.reduce((sum, row) => sum + STRENGTH[row.strength].rank, 0) /
            rows.length /
            3) *
            100
        )

  return (
    <div className="records-shell">
      <div
        className="records-scroll"
        tabIndex={0}
        aria-label={`${entityLabel} table. Scroll horizontally and vertically to view all columns and records.`}
      >
        <table className="records-table">
          <colgroup>
            <col className="records-company-col" />
            <col className="records-category-col" />
            <col className="records-last-col" />
            <col className="records-strength-col" />
            <col className="records-link-col" />
          </colgroup>
          <thead>
            <tr>
              <th className="records-header-cell records-sticky-cell">
                <div className="records-company-header">
                  <Checkbox
                    checked={allSelected}
                    mixed={partiallySelected}
                    onChange={onToggleAll}
                    label={`Select all ${entityLabel}`}
                  />
                  <span>Company</span>
                </div>
              </th>
              <HeaderCell
                label="Categories"
                sort={sort}
                onSort={toggleSort}
                icon={<TagIcon size={15} strokeWidth={1.8} />}
              />
              <HeaderCell
                label="Last interaction"
                sortKey="last"
                sort={sort}
                onSort={toggleSort}
                icon={<Clock size={15} strokeWidth={1.8} />}
              />
              <HeaderCell
                label="Connection strength"
                sortKey="strength"
                sort={sort}
                onSort={toggleSort}
                icon={<Heart size={15} strokeWidth={1.8} />}
              />
              <HeaderCell
                label="Links"
                sort={sort}
                onSort={toggleSort}
                icon={<Link2 size={15} strokeWidth={1.8} />}
              />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="records-empty">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const selectedRow = selected.has(row.id)
                const strength = STRENGTH[row.strength]
                const active = activeId === row.id
                return (
                  <tr
                    key={row.id}
                    className={`records-row ${selectedRow ? 'is-selected' : ''} ${
                      active ? 'is-active' : ''
                    }`}
                    onClick={() => onRowActivate?.(row.id)}
                  >
                    <td className="records-cell records-sticky-cell">
                      <div className="records-company-cell">
                      <span
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedRow}
                          onChange={() => onToggleRow(row.id)}
                          label={`Select ${row.name}`}
                        />
                      </span>
                      <span className="records-company-mark">
                        {row.name.slice(0, 1).toUpperCase()}
                      </span>
                      <button
                        type="button"
                        className={`records-company-name ${row.href ? 'has-link' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onRowActivate?.(row.id)
                        }}
                      >
                        {row.name}
                      </button>
                      </div>
                    </td>
                    <td className="records-cell">
                      <div className="records-tags">
                        {row.tags.slice(0, 4).map((tag) => (
                          <Tag key={tag} name={tag} />
                        ))}
                        {row.tags.length > 4 ? (
                          <span className="records-more-tag">+{row.tags.length - 4}</span>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={`records-cell ${
                        row.last === 'No contact' ? 'records-muted' : ''
                      }`}
                    >
                      {row.last}
                    </td>
                    <td className="records-cell">
                      <span className="records-strength">
                        <span
                          className="records-strength-dot"
                          style={{ background: strength.color }}
                        />
                        {strength.label}
                      </span>
                    </td>
                    <td className="records-cell">
                      {row.website && row.href ? (
                        <a
                          className="records-link"
                          href={row.href}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {row.website}
                          <ExternalLink size={12} strokeWidth={1.8} />
                        </a>
                      ) : (
                        <span className="records-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          <tfoot>
            <tr className="records-calculation-row">
              <td className="records-cell records-sticky-cell records-calculation-label">
                <span className="records-calculation-number">{rows.length}</span> count
              </td>
              <td className="records-cell">
                <span className="records-add-calculation">
                  <Plus size={14} strokeWidth={1.8} />
                  {rows.reduce((sum, row) => sum + row.tags.length, 0)} tags
                </span>
              </td>
              <td className="records-cell records-muted">—</td>
              <td className="records-cell">
                <span className="records-average">
                  <span
                    className="records-strength-dot"
                    style={{ background: 'var(--records-orange)' }}
                  />
                  {averagePct}% average
                </span>
              </td>
              <td className="records-cell">
                <span className="records-muted">
                  {linkCount} link{linkCount === 1 ? '' : 's'}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
