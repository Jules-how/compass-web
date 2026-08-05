import { z } from 'zod'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const uuid = (field: string) => z.string()
  .regex(UUID_PATTERN, `${field} must be a UUID`)
  .transform((value) => value.toLowerCase())
const positiveVersion = z.number().int().min(1, 'baseVersion must be a positive integer')
const normalizedEmail = z.string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().email('email is invalid').max(254, 'email is invalid'))

export const DELIVERY_PAGE_LIMIT_MAX = 50
export const COMMENT_LENGTH_MAX = 4000
export const DECISION_COMMENT_LENGTH_MAX = 2000
export const ATTACHMENT_SIZE_MAX = 4 * 1024 * 1024

export const PortalOperationIdSchema = uuid('operationId')
export const PortalResourceIdSchema = uuid('resourceId')
export const PortalEmailSchema = normalizedEmail

export const MagicLinkRequestSchema = z.object({
  email: normalizedEmail,
  invitationId: z.preprocess(
    (value) => value === null || value === '' ? undefined : value,
    uuid('invitationId').optional()
  )
})

export type MagicLinkRequest = z.infer<typeof MagicLinkRequestSchema>

export const PasswordLoginRequestSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(8).max(128),
  invitationId: z.preprocess(
    (value) => value === null || value === '' ? undefined : value,
    uuid('invitationId').optional()
  )
})

export type PasswordLoginRequest = z.infer<typeof PasswordLoginRequestSchema>

export const InvitationCommandSchema = z.object({
  tenantId: uuid('tenantId'),
  email: normalizedEmail,
  role: z.enum(['customer', 'operator']).default('customer'),
  expiresInHours: z.number().int().min(1).max(720).default(168)
})

export type InvitationCommand = z.infer<typeof InvitationCommandSchema>

export const DeliveryListQuerySchema = z.object({
  cursor: uuid('cursor').nullable(),
  limit: z.number().int().min(1).max(DELIVERY_PAGE_LIMIT_MAX)
})

export type DeliveryListQuery = z.infer<typeof DeliveryListQuerySchema>

export const CommentCommandSchema = z.object({
  itemId: uuid('itemId'),
  operationId: uuid('operationId'),
  body: z.string().trim().min(1, 'comment body is required')
    .max(COMMENT_LENGTH_MAX, `comment body must not exceed ${COMMENT_LENGTH_MAX} characters`)
})

export type CommentCommand = z.infer<typeof CommentCommandSchema>

export const CompleteItemCommandSchema = z.object({
  itemId: uuid('itemId'),
  operationId: uuid('operationId'),
  baseVersion: positiveVersion
})

export type CompleteItemCommand = z.infer<typeof CompleteItemCommandSchema>

export const DecisionCommandSchema = CompleteItemCommandSchema.extend({
  decision: z.enum(['approve', 'request_changes'], { error: 'decision is invalid' }),
  comment: z.preprocess(
    (value) => typeof value === 'string' ? value.trim() || null : null,
    z.string().max(
      DECISION_COMMENT_LENGTH_MAX,
      `decision comment must not exceed ${DECISION_COMMENT_LENGTH_MAX} characters`
    ).nullable()
  )
}).superRefine((value, context) => {
  if (value.decision === 'request_changes' && !value.comment) {
    context.addIssue({
      code: 'custom',
      path: ['comment'],
      message: 'a comment is required when requesting changes'
    })
  }
})

export type DecisionCommand = z.infer<typeof DecisionCommandSchema>

export const PortalAttachmentContentTypeSchema = z.enum([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
], { error: 'attachment content type is not allowed' })

export const AttachmentMetadataSchema = z.object({
  fileName: z.string().transform((value, context) => {
    const fileName = value
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
    if (!fileName || fileName === '.' || fileName === '..' || fileName.length > 180) {
      context.addIssue({ code: 'custom', message: 'file name is invalid' })
      return z.NEVER
    }
    return fileName
  }),
  contentType: z.string()
    .transform((value) => value.toLowerCase().trim())
    .pipe(PortalAttachmentContentTypeSchema),
  sizeBytes: z.number().int().min(1)
    .max(ATTACHMENT_SIZE_MAX, `attachment size must be between 1 and ${ATTACHMENT_SIZE_MAX} bytes`)
})

export type AttachmentMetadata = z.infer<typeof AttachmentMetadataSchema>

export const DeliveryProjectCustomerDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  customerSummary: z.string(),
  status: z.string(),
  version: z.number(),
  updatedAt: z.string()
})

export type DeliveryProjectCustomerDto = z.infer<typeof DeliveryProjectCustomerDtoSchema>

export const DeliveryItemCustomerDtoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  customerDescription: z.string(),
  evidenceRequest: z.string().nullable(),
  actionOwner: z.enum(['operator', 'client']),
  customerState: z.string(),
  dueAt: z.string().nullable(),
  reviewable: z.boolean(),
  version: z.number(),
  updatedAt: z.string()
})

export type DeliveryItemCustomerDto = z.infer<typeof DeliveryItemCustomerDtoSchema>

export const PortalRpcResultSchema = z.object({
  ok: z.boolean(),
  code: z.string().optional()
}).loose()

export type PortalRpcResult = z.infer<typeof PortalRpcResultSchema>

export function parseOperationId(value: unknown): string {
  return PortalOperationIdSchema.parse(value)
}

export function parseResourceId(value: unknown, field = 'resourceId'): string {
  return uuid(field).parse(value)
}

export function normalizePortalEmail(value: unknown): string {
  return PortalEmailSchema.parse(value)
}

export function parseMagicLinkRequest(value: unknown): MagicLinkRequest {
  return MagicLinkRequestSchema.parse(value)
}

export function parsePasswordLoginRequest(value: unknown): PasswordLoginRequest {
  return PasswordLoginRequestSchema.parse(value)
}

export function parseInvitationCommand(value: unknown): InvitationCommand {
  return InvitationCommandSchema.parse(value)
}

export function parseDeliveryListQuery(params: URLSearchParams): DeliveryListQuery {
  const cursorValue = params.get('cursor')
  const parsedLimit = Number.parseInt(params.get('limit') ?? '25', 10)
  const finiteLimit = Number.isFinite(parsedLimit) ? parsedLimit : 25
  return DeliveryListQuerySchema.parse({
    cursor: cursorValue || null,
    limit: Math.min(Math.max(finiteLimit, 1), DELIVERY_PAGE_LIMIT_MAX)
  })
}

export function parseCommentCommand(value: unknown): CommentCommand {
  return CommentCommandSchema.parse(value)
}

export function parseCompleteItemCommand(value: unknown): CompleteItemCommand {
  return CompleteItemCommandSchema.parse(value)
}

export function parseDecisionCommand(value: unknown): DecisionCommand {
  return DecisionCommandSchema.parse(value)
}

export function sanitizeAttachmentName(value: unknown): string {
  return AttachmentMetadataSchema.shape.fileName.parse(value)
}

export function parseAttachmentMetadata(value: unknown): AttachmentMetadata {
  return AttachmentMetadataSchema.parse(value)
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function projectCustomerProject(row: Record<string, unknown>): DeliveryProjectCustomerDto {
  return DeliveryProjectCustomerDtoSchema.parse({
    id: text(row.id),
    name: text(row.name),
    customerSummary: text(row.customer_summary),
    status: text(row.status),
    version: Number(row.version),
    updatedAt: text(row.updated_at)
  })
}

export function projectCustomerItem(row: Record<string, unknown>): DeliveryItemCustomerDto {
  return DeliveryItemCustomerDtoSchema.parse({
    id: text(row.id),
    projectId: text(row.project_id),
    title: text(row.title),
    customerDescription: text(row.customer_description),
    evidenceRequest: nullableText(row.evidence_request),
    actionOwner: row.action_owner === 'client' ? 'client' : 'operator',
    customerState: text(row.customer_state),
    dueAt: nullableText(row.due_at),
    reviewable: row.reviewable === true,
    version: Number(row.version),
    updatedAt: text(row.updated_at)
  })
}

export function parsePortalRpcResult(value: unknown): PortalRpcResult {
  return PortalRpcResultSchema.parse(value)
}
