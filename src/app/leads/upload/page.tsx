import { notFound, redirect } from 'next/navigation'
import LeadUploadClient from '@/components/LeadUploadClient'
import { OperatorShell } from '@/components/OperatorShell'
import { PortalAccessError, requirePortalAccess } from '@/lib/portal-access'

export const dynamic = 'force-dynamic'

export default async function LeadUploadPage() {
  let access
  try {
    access = await requirePortalAccess({ operator: true })
  } catch (error) {
    if (error instanceof PortalAccessError && error.kind === 'unauthorized') redirect('/login')
    notFound()
  }

  return (
    <OperatorShell
      active="upload"
      role={access.primary.role}
      title="Upload leads"
      subtitle="CSV import into the lead mirror."
      width="3xl"
    >
      <LeadUploadClient />
    </OperatorShell>
  )
}
