import { InboundLeadTable } from '@/components/InboundLeadTable'
import { OperatorShell } from '@/components/OperatorShell'
import type { NavKey } from '@/components/NavLinks'
import {
  projectInboundLead,
  type InboundLeadSource,
  type PortalInboundLead
} from '@/lib/inbound-leads'
import type { PortalAccess } from '@/lib/portal-access'
import { isOperatorRole } from '@/lib/portal-redirect'

const PAGE_SIZE = 50

export async function loadInboundLeads(
  access: PortalAccess,
  sourceFilter?: string
): Promise<{ leads: PortalInboundLead[]; error: string | null; total: number }> {
  let query = access.supabase
    .from('portal_inbound_leads')
    .select(
      'id,tenant_id,external_id,source,channel,name,email,phone,submitted_at,summary,created_at,lifecycle_status,lifecycle_updated_at',
      { count: 'exact' }
    )
    .order('submitted_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (!isOperatorRole(access.primary.role)) {
    query = query.eq('tenant_id', access.primary.tenantId)
  }
  if (sourceFilter) query = query.eq('source', sourceFilter)

  const { data, error, count } = await query
  if (error) return { leads: [], error: error.message, total: 0 }
  return {
    leads: ((data ?? []) as Record<string, unknown>[]).map(projectInboundLead),
    error: null,
    total: count ?? 0
  }
}

export function InboundLeadsView({
  access,
  leads,
  error,
  total,
  sourceFilter,
  activeNav,
  basePath
}: {
  access: PortalAccess
  leads: PortalInboundLead[]
  error: string | null
  total: number
  sourceFilter?: string
  activeNav: NavKey
  basePath: string
}) {
  return (
    <OperatorShell
      active={activeNav}
      role={access.primary.role}
      title={activeNav === 'inbox' ? 'Inbox' : 'Leads'}
      subtitle={
        activeNav === 'inbox'
          ? `Client inbound leads${
              isOperatorRole(access.primary.role) ? ' · all tenants' : ` · ${access.primary.tenantName}`
            } · ${total} lead${total === 1 ? '' : 's'}`
          : `${access.primary.tenantName} · ${total} lead${total === 1 ? '' : 's'}`
      }
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load leads: {error}
        </div>
      ) : (
        <InboundLeadTable leads={leads} sourceFilter={sourceFilter} basePath={basePath} />
      )}
    </OperatorShell>
  )
}

export type { InboundLeadSource }
