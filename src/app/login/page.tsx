import { redirect } from 'next/navigation'

import PasswordLoginForm from '@/components/PasswordLoginForm'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { isOpenOperatorEnabled } from '@/lib/open-operator'

export const dynamic = 'force-dynamic'

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getAuthenticatedUser()
  if (user) redirect('/tasks')

  const params = await searchParams
  const invitationId = first(params.invitation)
  const denied = first(params.error) === 'access_denied'
  const openOperator = isOpenOperatorEnabled()

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-sf-orange text-white">
            <span className="text-lg font-bold">C</span>
          </div>
          <h1 className="text-xl font-semibold text-neutral-900">Compass</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {openOperator
              ? 'Open operator mode is on — refresh if you were not signed in automatically.'
              : 'Invite-only access for clients and Compass operators.'}
          </p>
        </div>
        {denied && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            This link is invalid or no longer available. Ask your Switchflow contact for a new
            invitation.
          </p>
        )}
        {openOperator ? (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Auto-login did not establish a session. Use the operator credentials below, then retry.
          </p>
        ) : null}
        <PasswordLoginForm invitationId={invitationId} />
      </div>
    </main>
  )
}
