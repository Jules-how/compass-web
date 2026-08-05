'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'

export default function SignOutButton() {
  const router = useRouter()
  const { signOut } = useAuth()

  async function handleSignOut() {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100"
    >
      Sign out
    </button>
  )
}
