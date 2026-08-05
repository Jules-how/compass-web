import { type NextRequest } from 'next/server'

import {
  parseAttachmentMetadata,
  ATTACHMENT_SIZE_MAX,
  parseDeliveryListQuery,
  parseOperationId,
  parseResourceId,
  parsePortalRpcResult
} from '@/lib/portal-contracts'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalCommandResponse,
  portalJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ itemId: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { itemId: rawItemId } = await context.params
    const itemId = parseResourceId(rawItemId, 'itemId')
    const { cursor, limit } = parseDeliveryListQuery(new URL(request.url).searchParams)
    const { supabase, user } = await requirePortalAccess({ delivery: true })
    let query = supabase
      .from('delivery_attachments')
      .select('id,item_id,file_name,content_type,size_bytes,actor_id,created_at')
      .eq('item_id', itemId)
      .order('id', { ascending: true })
      .limit(limit + 1)
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query
    if (error) return portalJson({ error: 'not_found' }, { status: 404 })
    const rows = data ?? []
    const hasMore = rows.length > limit
    const attachments = rows.slice(0, limit).map((row) => ({
      id: row.id,
      itemId: row.item_id,
      fileName: row.file_name,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      author: row.actor_id === user.id ? 'You' : 'Portal member',
      createdAt: row.created_at,
      downloadPath: `/api/delivery/attachments/${row.id}/download`
    }))
    return portalJson({ attachments, nextCursor: hasMore ? attachments.at(-1)?.id ?? null : null })
  } catch (error) {
    return portalAccessResponse(error) ?? portalJson({ error: 'not_found' }, { status: 404 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  try {
    const contentLength = Number(request.headers.get('content-length') ?? '0')
    if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
      return portalJson({ error: 'content_length_required' }, { status: 411 })
    }
    if (contentLength > ATTACHMENT_SIZE_MAX + 128 * 1024) {
      return portalJson({ error: 'attachment_too_large' }, { status: 413 })
    }
    const { itemId: rawItemId } = await context.params
    const itemId = parseResourceId(rawItemId, 'itemId')
    const { supabase } = await requirePortalAccess({ delivery: true })
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return portalJson({ error: 'file_required' }, { status: 400 })
    const operationId = parseOperationId(form.get('operationId'))
    const metadata = parseAttachmentMetadata({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size
    })

    const { data: item, error: itemError } = await supabase
      .from('delivery_items')
      .select('id,project_id,tenant_id')
      .eq('id', itemId)
      .maybeSingle()
    if (itemError || !item) return portalJson({ error: 'not_found' }, { status: 404 })

    const attachmentId = crypto.randomUUID()
    const storagePath = `${item.tenant_id}/${item.project_id}/${item.id}/${attachmentId}/evidence`
    const { error: uploadError } = await supabase.storage
      .from('delivery-evidence')
      .upload(storagePath, file, { contentType: metadata.contentType, upsert: false })
    if (uploadError) return portalJson({ error: 'upload_failed' }, { status: 400 })

    const { data, error } = await supabase.rpc('portal_register_delivery_attachment', {
      p_item_id: itemId,
      p_operation_id: operationId,
      p_attachment_id: attachmentId,
      p_storage_path: storagePath,
      p_file_name: metadata.fileName,
      p_content_type: metadata.contentType,
      p_size_bytes: metadata.sizeBytes
    })
    const result = error ? null : parsePortalRpcResult(data)
    if (!result?.ok) await supabase.storage.from('delivery-evidence').remove([storagePath])
    return portalCommandResponse(data, error)
  } catch (error) {
    return portalAccessResponse(error) ?? portalJson({ error: 'invalid_request' }, { status: 400 })
  }
}
