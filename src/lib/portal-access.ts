import type { SupabaseClient, User } from '@supabase/supabase-js'

import { getPortalAdminClient } from './portal-admin'
import { isOpenOperatorEnabled } from './open-operator'
import { getSupabaseServerClient } from './supabase-server'
import { isSessionCurrent } from './session-current'
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

/** Process-local membership cache — skips portal_access_context RPC on rapid RSC nav. */
const MEMBERSHIP_CACHE_TTL_MS = 30_000

type MembershipCacheEntry = {
  memberships: PortalMembership[]
  updatedAt: number
}

const membershipCache = new Map<string, MembershipCacheEntry>()

/** Clear process-local portal membership cache (tests / forced refresh). */
export function clearPortalMembershipCache() {
  membershipCache.clear()
}

export function isDeliveryPortalEnabled(): boolean {
  return process.env.COMPASS_PORTAL_V1 === '1'
}

function openOperatorAccess(): PortalAccess {
  const primary: PortalMembership = {
    tenantId: 'open-operator',
    tenantName: 'Switchflow',
    role: 'owner',
    landingPath: '/home'
  }
  const user = {
    id: 'open-operator',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'open-operator@compass.local',
    app_metadata: { provider: 'open-operator', providers: ['open-operator'] },
    user_metadata: {},
    created_at: '1970-01-01T00:00:00.000Z'
  } as User

  return {
    supabase: getPortalAdminClient(),
    user,
    memberships: [primary],
    primary,
    isOperator: true
  }
}

function mapMemberships(data: unknown): PortalMembership[] {
  return ((data ?? []) as AccessRow[])
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
}

export async function requirePortalAccess(
  options: { operator?: boolean; delivery?: boolean } = {}
): Promise<PortalAccess> {
  if (options.delivery && !isDeliveryPortalEnabled()) throw new PortalAccessError('not_found')

  // Compass is an owner-operated internal console. In open-operator mode the
  // operator surface uses the existing server-only admin client and never
  // exposes the service-role key to the browser. Customer/delivery access keeps
  // its normal authenticated, tenant-scoped path below.
  if (options.operator && !options.delivery && isOpenOperatorEnabled()) {
    return openOperatorAccess()
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()

  if (authError || !user) throw new PortalAccessError('unauthorized')
  if (user.app_metadata?.compass_session_not_before) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!isSessionCurrent(user, session?.access_token)) throw new PortalAccessError('unauthorized')
  }

  const cached = membershipCache.get(user.id)
  let memberships: PortalMembership[]
  if (cached && Date.now() - cached.updatedAt < MEMBERSHIP_CACHE_TTL_MS) {
    memberships = cached.memberships
  } else {
    const { data, error } = await supabase.rpc('portal_access_context')
    if (error) throw new PortalAccessError('not_found')
    memberships = mapMemberships(data)
    membershipCache.set(user.id, { memberships, updatedAt: Date.now() })
  }

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
