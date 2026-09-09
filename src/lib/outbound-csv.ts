import Papa from 'papaparse'

/** CSV transports facts; it never turns a loose scrape or a column label into verification. */
export function parsePreparationCsv(csv: string): Record<string, unknown>[] {
  if (new TextEncoder().encode(csv).length > 6 * 1024 * 1024) throw new Error('CSV must be smaller than 6 MB.')
  const result = Papa.parse<Record<string, string>>(csv, {header: true, skipEmptyLines: 'greedy', transformHeader: h => h.replace(/^\uFEFF/, '').trim()})
  if (result.errors.length) throw new Error(`CSV row ${Number(result.errors[0].row ?? 0) + 2}: ${result.errors[0].message}`)
  const headers = result.meta.fields ?? []
  if (new Set(headers).size !== headers.length || result.meta.renamedHeaders && Object.keys(result.meta.renamedHeaders).length) throw new Error('CSV headers must be unique.')
  if (!result.data.length || result.data.length > 200) throw new Error('Upload 1–200 rows per batch. Larger lists can be processed in batches by the agent.')
  const nameKeys = ['company','business_name','company_name','title','Business Name']
  if (!nameKeys.some(k => headers.includes(k))) throw new Error('Include a company, business_name, company_name, title or Business Name column.')
  return result.data.map((row, i) => {
    const out: Record<string, unknown> = {...row, source_row: i + 2}
    out.company = nameKeys.map(k => row[k]?.trim()).find(Boolean) ?? ''
    out.website = row.website || row.website_url || row.Website || ''
    out.email = row.verified_email || row.email || row.Email || row.published_email || ''
    for (const key of ['evidence', 'verification', 'contact_basis', 'geography_review']) {
      if (!row[key]?.trim()) { delete out[key]; continue }
      try { out[key] = JSON.parse(row[key]) } catch { throw new Error(`Row ${i + 2}: ${key} must contain valid JSON.`) }
    }
    out.identity_reviewed = row.identity_reviewed?.trim().toLowerCase() === 'true'
    return out
  })
}

export function reviewCsv(records: Array<{candidate: {company: string; email: string; evidence: unknown; verification?: unknown}; status: string; reasons: string[]; rendered: null | {values: Record<string,string>; steps: Array<{subject: string;body: string}>}}>) {
  return Papa.unparse(records.map(r => ({company: r.candidate.company, email: r.candidate.email, status: r.status, reasons: r.reasons.join('; '), signal: r.rendered?.values.signal_label ?? '', opener: r.rendered?.values.opener ?? '', subject: r.rendered?.values.subject ?? '', email_1: r.rendered?.steps[0]?.body ?? '', email_2: r.rendered?.steps[1]?.body ?? '', evidence: JSON.stringify(r.candidate.evidence), verification: JSON.stringify(r.candidate.verification ?? null)})), {escapeFormulae: true})
}
