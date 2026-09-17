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
  if (isOpenOperatorEnabled()) redirect('/home')

  const user = await getAuthenticatedUser()
  if (user) redirect('/tasks')

  const params = await searchParams
  const invitationId = first(params.invitation)
  const denied = first(params.error) === 'access_denied'

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-fade-up rounded-2xl border border-stone-200/70 bg-white/95 p-8 shadow-lift backdrop-blur-sm">
        <div className="mb-7 text-center">
          <div
            className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#ffe5d8] text-[#eb4f0f]"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
              <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M12 5.4 13.35 10.65 18.6 12 13.35 13.35 12 18.6 10.65 13.35 5.4 12 10.65 10.65Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-neutral-900">
            Compass
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
            Invite-only access for clients and Compass operators.
          </p>
        </div>
        {denied && (
          <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            This link is invalid or no longer available. Ask your Switchflow contact for a new
            invitation.
          </p>
        )}
        <PasswordLoginForm invitationId={invitationId} />
      </div>
    </main>
  )
}
