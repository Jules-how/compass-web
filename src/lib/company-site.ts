const GENERIC_EMAIL_HOSTS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'outlook.com',
  'outlook.com.au',
  'yahoo.com',
  'yahoo.com.au',
  'icloud.com',
  'me.com',
  'live.com',
  'msn.com',
  'bigpond.com',
  'bigpond.net.au',
  'optusnet.com.au',
  'iinet.net.au',
  'internode.on.net',
  'mail.com',
  'protonmail.com',
  'aol.com'
])

const SHARED_WEBSITE_HOSTS = new Set(['tradehq.com.au'])

const MAX_WEBSITE = 500

export function normalizeCompanyDomain(raw: string | null | undefined): string | null {
  const host = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
  if (!host || !host.includes('.') || GENERIC_EMAIL_HOSTS.has(host)) return null
  return host
}

export function websiteFromHost(host: string | null | undefined): string | null {
  const domain = normalizeCompanyDomain(host)
  return domain ? `https://${domain}` : null
}

export function companyDomainFromEmail(email: string | null | undefined): string | null {
  const value = String(email || '')
    .trim()
    .toLowerCase()
  const at = value.lastIndexOf('@')
  if (at < 0) return null
  return normalizeCompanyDomain(value.slice(at + 1))
}

export function parseCompanySite(raw: string | null | undefined): {
  website: string | null
  company_domain: string | null
} {
  const trimmed = String(raw || '').trim()
  if (!trimmed || trimmed.length > MAX_WEBSITE) return { website: null, company_domain: null }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { website: null, company_domain: null }
    }
    const domain = normalizeCompanyDomain(url.hostname)
    if (!domain) return { website: null, company_domain: null }
    url.hostname = domain
    url.hash = ''
    const website = url.toString().replace(/\/$/, '')
    return { website, company_domain: SHARED_WEBSITE_HOSTS.has(domain) ? null : domain }
  } catch {
    return { website: null, company_domain: null }
  }
}

export function siteFromEmailOrUrl(input: {
  email?: string | null
  website?: string | null
}): { website: string | null; company_domain: string | null } {
  const fromUrl = parseCompanySite(input.website)
  if (fromUrl.website) return fromUrl
  const domain = companyDomainFromEmail(input.email)
  if (!domain) return { website: null, company_domain: null }
  return { website: `https://${domain}`, company_domain: domain }
}
