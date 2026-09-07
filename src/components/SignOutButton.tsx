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
    // Open-operator mode will immediately re-establish a session on the next request.
    router.push('/home')
    router.refresh()
  }

  const className =
    variant === 'sidebar'
      ? 'w-full rounded-xl px-2.5 py-2 text-left text-[14px] font-medium text-neutral-500 transition hover:bg-white hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d2a]/40'
      : 'compass-btn-secondary'

  return (
    <button type="button" onClick={handleSignOut} className={className}>
      Sign out
    </button>
  )
}
