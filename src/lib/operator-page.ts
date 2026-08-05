import { notFound, redirect } from 'next/navigation'

import { PortalAccessError, requirePortalAccess } from './portal-access'

export async function requireOperatorPageAccess() {
  try {
    return await requirePortalAccess({ operator: true })
  } catch (error) {
    if (error instanceof PortalAccessError && error.kind === 'unauthorized') {
      redirect('/login')
    }
    notFound()
  }
}
