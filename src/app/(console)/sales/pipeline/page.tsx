import { redirect } from 'next/navigation'

/** Pipeline calendar now lives on Outbound. Campaign pages stay at /sales/pipeline/:id. */
export default function PipelinePage() {
  redirect('/sales/outbound')
}
