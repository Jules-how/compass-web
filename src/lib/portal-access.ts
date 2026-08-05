import type { SupabaseClient, User } from '@supabase/supabase-js'

import { getSupabaseServerClient } from './supabase-server'
import { isOperatorRole, type PortalRole } from './portal-redirect'

export interface PortalMembership {
  tenantId: string
  tenantName: string
  role: PortalRole
  landingPath: string
}

export interface PortalAccess {
  supabase: SupabaseClient
  user: User
  memberships: PortalMembership[]
  primary: PortalMembership
  isOperator: boolean
}

export class PortalAccessError extends Error {
  constructor(
    public readonly kind: 'unauthorized' | 'not_found',
    message = kind
  ) {
    super(message)
  }
}

interface AccessRow {
  tenant_id: string
  tenant_name: string
  member_role: PortalRole
  landing_path: string
}

export function isDeliveryPortalEnabled(): boolean {
  return process.env.COMPASS_PORTAL_V1 === '1'
}

export async function requirePortalAccess(
  options: { operator?: boolean; delivery?: boolean } = {}
): Promise<PortalAccess> {
  if (options.delivery && !isDeliveryPortalEnabled()) throw new PortalAccessError('not_found')

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()

  if (authError || !user) throw new PortalAccessError('unauthorized')

  const { data, error } = await supabase.rpc('portal_access_context')
  if (error) throw new PortalAccessError('not_found')
  const memberships = ((data ?? []) as AccessRow[])
    .filter(
      (row) =>
        typeof row.tenant_id === 'string' &&
        typeof row.tenant_name === 'string' &&
        (row.member_role === 'owner' ||
          row.member_role === 'operator' ||
          row.member_role === 'customer')
    )
    .map((row) => ({
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      role: row.member_role,
      landingPath: row.landing_path
    }))

  const primary = memberships[0]
  if (!primary) throw new PortalAccessError('not_found')
  const operator = memberships.some((membership) => isOperatorRole(membership.role))
  if (options.operator && !operator) throw new PortalAccessError('not_found')

  return {
    supabase,
    user,
    memberships,
    primary,
    isOperator: operator
  }
}
