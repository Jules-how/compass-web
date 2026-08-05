import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'

import DeliveryItemActions from '@/components/DeliveryItemActions'
import { OperatorShell } from '@/components/OperatorShell'
import { PortalAccessError, requirePortalAccess } from '@/lib/portal-access'
import { isOperatorRole } from '@/lib/portal-redirect'
import {
  parseResourceId,
  projectCustomerItem,
  projectCustomerProject
} from '@/lib/portal-contracts'

export const dynamic = 'force-dynamic'

interface DeliveryProjectPageProps {
  params: Promise<{ projectId: string }>
}

function displayDate(value: string | null | undefined): string {
  if (!value) return 'No due date'
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(value))
}

export default async function DeliveryProjectPage({ params }: DeliveryProjectPageProps) {
  let projectId: string
  try {
    projectId = parseResourceId((await params).projectId, 'projectId')
  } catch {
    notFound()
  }

  let access
  try {
    access = await requirePortalAccess({ delivery: true })
  } catch (error) {
    if (error instanceof PortalAccessError && error.kind === 'unauthorized') redirect('/login')
    notFound()
  }

  if (!isOperatorRole(access.primary.role)) redirect('/leads')

  const [projectResult, itemsResult] = await Promise.all([
    access.supabase
      .from('delivery_projects')
      .select('id,name,customer_summary,status,version,updated_at')
      .eq('id', projectId)
      .maybeSingle(),
    access.supabase
      .from('delivery_items')
      .select(
        'id,project_id,title,customer_description,evidence_request,action_owner,customer_state,due_at,reviewable,version,updated_at'
      )
      .eq('project_id', projectId)
      .order('id', { ascending: true })
      .limit(50)
  ])
  if (projectResult.error || !projectResult.data) notFound()

  const project = projectCustomerProject(projectResult.data as Record<string, unknown>)
  const items = ((itemsResult.data ?? []) as Record<string, unknown>[]).map(projectCustomerItem)
  const itemIds = items.map((item) => item.id)

  const [commentsResult, attachmentsResult, decisionsResult] = itemIds.length
    ? await Promise.all([
        access.supabase
          .from('delivery_comments')
          .select('id,item_id,body,actor_id,created_at')
          .in('item_id', itemIds)
          .order('created_at', { ascending: true })
          .limit(200),
        access.supabase
          .from('delivery_attachments')
          .select('id,item_id,file_name,size_bytes,actor_id,created_at')
          .in('item_id', itemIds)
          .order('created_at', { ascending: true })
          .limit(200),
        access.supabase
          .from('delivery_decisions')
          .select('id,item_id,decision,comment,actor_id,created_at')
          .in('item_id', itemIds)
          .order('created_at', { ascending: true })
          .limit(100)
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const comments = commentsResult.data ?? []
  const attachments = attachmentsResult.data ?? []
  const decisions = decisionsResult.data ?? []

  return (
    <OperatorShell
      active="delivery"
      role={access.primary.role}
      title={project.name}
      subtitle={project.customerSummary}
      width="4xl"
    >
      <Link href="/delivery" className="mb-6 inline-block text-sm text-sf-orange-dark hover:underline">
        ← All delivery projects
      </Link>

      <div className="space-y-5">
        {items.map((item) => {
          const itemComments = comments.filter((entry) => entry.item_id === item.id)
          const itemAttachments = attachments.filter((entry) => entry.item_id === item.id)
          const itemDecisions = decisions.filter((entry) => entry.item_id === item.id)
          return (
            <article key={item.id} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-neutral-900">{item.title}</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    {item.actionOwner === 'client' ? 'Your action' : 'Switchflow action'} · {displayDate(item.dueAt)}
                  </p>
                </div>
                <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
                  {item.customerState.replaceAll('_', ' ')}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                {item.customerDescription}
              </p>
              {item.evidenceRequest && (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  Evidence requested: {item.evidenceRequest}
                </p>
              )}

              {itemComments.length > 0 && (
                <section className="mt-4 space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Comments</h3>
                  {itemComments.map((entry) => (
                    <div key={entry.id} className="rounded-lg bg-neutral-50 p-3 text-sm">
                      <p className="whitespace-pre-wrap text-neutral-700">{entry.body}</p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {entry.actor_id === access.user.id ? 'You' : 'Portal member'}
                      </p>
                    </div>
                  ))}
                </section>
              )}

              {itemAttachments.length > 0 && (
                <section className="mt-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Evidence</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {itemAttachments.map((entry) => (
                      <li key={entry.id}>
                        <a
                          className="text-sf-orange-dark hover:underline"
                          href={`/api/delivery/attachments/${entry.id}/download`}
                        >
                          {entry.file_name}
                        </a>{' '}
                        <span className="text-neutral-400">({Math.ceil(entry.size_bytes / 1024)} KB)</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {itemDecisions.length > 0 && (
                <section className="mt-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Decisions</h3>
                  <ul className="mt-2 space-y-2 text-sm text-neutral-700">
                    {itemDecisions.map((entry) => (
                      <li key={entry.id} className="rounded-lg bg-neutral-50 p-3">
                        <span className="font-medium">{entry.decision.replace('_', ' ')}</span>
                        {entry.comment ? <p className="mt-1 whitespace-pre-wrap">{entry.comment}</p> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <DeliveryItemActions item={item} />
            </article>
          )
        })}
      </div>
    </OperatorShell>
  )
}
