import { type NextRequest } from 'next/server'

import { parseResourceId } from '@/lib/portal-contracts'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ attachmentId: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { attachmentId: rawAttachmentId } = await context.params
    const attachmentId = parseResourceId(rawAttachmentId, 'attachmentId')
    const { supabase } = await requirePortalAccess({ delivery: true })
    const { data: attachment, error } = await supabase
      .from('delivery_attachments')
      .select('storage_bucket,storage_path,file_name')
      .eq('id', attachmentId)
      .maybeSingle()
    if (error || !attachment) return portalJson({ error: 'not_found' }, { status: 404 })

    const { data, error: signError } = await supabase.storage
      .from(attachment.storage_bucket)
      .createSignedUrl(attachment.storage_path, 60, { download: attachment.file_name })
    if (signError || !data?.signedUrl) {
      return portalJson({ error: 'download_failed' }, { status: 500 })
    }
    return Response.redirect(data.signedUrl, 303)
  } catch (error) {
    return portalAccessResponse(error) ?? portalJson({ error: 'not_found' }, { status: 404 })
  }
}
