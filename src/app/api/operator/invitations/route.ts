import { type NextRequest } from 'next/server'

import { getPortalAdminClient } from '@/lib/portal-admin'
import { requirePortalAccess } from '@/lib/portal-access'
import { parseInvitationCommand } from '@/lib/portal-contracts'
import { portalAccessResponse, portalJson, readBoundedJson, requireSameOrigin } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

interface InvitationRow {
  invitation_id: string
  normalized_email: string
  expires_at: string
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  let input
  try {
    input = parseInvitationCommand(await readBoundedJson(request, 4096))
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true, delivery: true })
    const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase.rpc('portal_create_invitation', {
      p_tenant_id: input.tenantId,
      p_email: input.email,
      p_role: input.role,
      p_expires_at: expiresAt
    })
    const invitation = ((data ?? []) as InvitationRow[])[0]
    if (error || !invitation) return portalJson({ error: 'invite_failed' }, { status: 400 })

    const callback = new URL('/auth/callback', request.url)
    callback.searchParams.set('invitation', invitation.invitation_id)
    callback.searchParams.set('next', input.role === 'operator' ? '/tasks' : '/leads')
    const { error: sendError } = await getPortalAdminClient().auth.admin.inviteUserByEmail(
      invitation.normalized_email,
      { redirectTo: callback.toString() }
    )
    if (sendError) {
      await supabase.rpc('portal_revoke_invitation', {
        p_invitation_id: invitation.invitation_id
      })
      return portalJson({ error: 'invite_failed' }, { status: 502 })
    }

    return portalJson(
      { invitationId: invitation.invitation_id, expiresAt: invitation.expires_at },
      { status: 201 }
    )
  } catch (error) {
    return portalAccessResponse(error) ?? portalJson({ error: 'invite_failed' }, { status: 500 })
  }
}
