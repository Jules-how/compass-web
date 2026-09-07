import { OnboardingFormClient } from './OnboardingFormClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function OnboardPage({ params }: PageProps) {
  const { token } = await params

  return (
    <main className="min-h-dvh px-4 py-8 sm:py-12">
      <OnboardingFormClient token={token} />
    </main>
  )
}
