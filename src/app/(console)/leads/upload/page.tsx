import LeadUploadClient from '@/components/LeadUploadClient'
import { OperatorShell } from '@/components/OperatorShell'

export default function LeadUploadPage() {
  return (
    <OperatorShell title="Upload leads" subtitle="CSV import into the lead mirror." width="3xl">
      <LeadUploadClient />
    </OperatorShell>
  )
}
