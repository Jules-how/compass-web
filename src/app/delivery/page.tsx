import { redirect } from 'next/navigation'
import Link from 'next/link'

import { OperatorShell } from '@/components/OperatorShell'
import { PortalAccessError, requirePortalAccess } from '@/lib/portal-access'
import { isOperatorRole } from '@/lib/portal-redirect'
import { projectCustomerProject } from '@/lib/portal-contracts'

export const dynamic = 'force-dynamic'

export default async function DeliveryPage() {
  let access
  try {
    access = await requirePortalAccess({ delivery: true })
  } catch (error) {
    if (error instanceof PortalAccessError) redirect('/login')
    throw error
  }

  if (!isOperatorRole(access.primary.role)) redirect('/leads')

  const { data, error } = await access.supabase
    .from('delivery_projects')
    .select('id,name,customer_summary,status,version,updated_at')
    .order('id', { ascending: true })
    .limit(25)
  const projects = ((data ?? []) as Record<string, unknown>[]).map(projectCustomerProject)

  return (
    <OperatorShell
      active="delivery"
      role={access.primary.role}
      title="Delivery"
      subtitle={`${access.primary.tenantName} · customer actions, evidence and decisions`}
      width="4xl"
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Delivery work is temporarily unavailable.{' '}
          <Link href="/delivery" className="font-medium underline">
            Retry
          </Link>
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          No delivery projects are ready yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/delivery/${project.id}`}
              className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-sf-orange/50"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-neutral-900">{project.name}</h2>
                <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-600">
                  {project.status.replace('_', ' ')}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-600">{project.customerSummary}</p>
            </Link>
          ))}
        </div>
      )}
    </OperatorShell>
  )
}
