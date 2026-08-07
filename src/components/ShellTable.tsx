import type { ReactNode } from 'react'

/** Simple operator table — empty or with row cells. */
export function ShellTable({
  columns,
  rows = [],
  emptyMessage
}: {
  columns: string[]
  rows?: ReactNode[][]
  emptyMessage: string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200/70 bg-white shadow-soft">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-stone-100 bg-stone-50/80 text-neutral-500">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em]"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-neutral-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="transition hover:bg-stone-50/70">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3 align-middle text-neutral-800">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
