// Browser-side CSV export. Builds a CSV string from an array of flat records
// and triggers a download via a Blob URL. No external dependency; RFC 4180-ish
// quoting (wrap fields that contain a comma, quote, or newline; double inner
// quotes).

function escapeCell(value: unknown): string {
  if (value == null) return ''
  const str = typeof value === 'string' ? value : String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// Preserve key insertion order of the first row as the header so callers can
// control column order by constructing objects in the order they want.
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.map(escapeCell).join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(','))
  }
  return lines.join('\n')
}

export function exportToCsv(rows: Record<string, unknown>[], filename: string): void {
  const csv = toCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Release the blob URL on the next tick so the click has time to dispatch.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
