import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Operator landing page. */
export default function RootPage() {
  redirect('/tasks')
}
