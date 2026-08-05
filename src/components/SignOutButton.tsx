'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'

export default function SignOutButton({
  variant = 'default'
}: {
  variant?: 'default' | 'sidebar'
}) {
  const router = useRouter()
  const { signOut } = useAuth()

  async function handleSignOut() {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  const className =
    variant === 'sidebar'
      ? 'w-full rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium text-neutral-400 transition hover:bg-white/5 hover:text-neutral-100'
      : 'rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100'

  return (
    <button type="button" onClick={handleSignOut} className={className}>
      Sign out
    </button>
  )
}
