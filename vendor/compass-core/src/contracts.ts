import { z } from 'zod'

const NonEmptyStringSchema = z.string().trim().min(1)
const NonNegativeIntegerSchema = z.number().int().nonnegative()
const TimestampSchema = z.string().datetime({ offset: true })
const JsonRecordSchema = z.record(z.string(), z.unknown())

export const CommandContextSchema = z.object({
  actorId: NonEmptyStringSchema,
  tenantId: NonEmptyStringSchema.optional(),
  operationId: NonEmptyStringSchema,
  baseVersion: NonNegativeIntegerSchema.optional(),
  approvalId: NonEmptyStringSchema.optional()
})

export type CommandContext = z.infer<typeof CommandContextSchema>

export const PageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50)
})

export type PageQuery = z.infer<typeof PageQuerySchema>

export function PageSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().optional(),
    hasMore: z.boolean()
  })
}

export interface Page<T> {
  items: T[]
  nextCursor?: string
  hasMore: boolean
}

export const RiskTierSchema = z.enum(['read', 'reversible', 'external', 'critical'])

export type RiskTier = z.infer<typeof RiskTierSchema>

export const ApprovalEnvelopeSchema = z.object({
  id: NonEmptyStringSchema,
  actorId: NonEmptyStringSchema,
  tenantId: NonEmptyStringSchema.optional(),
  action: NonEmptyStringSchema,
  resourceIds: z.array(NonEmptyStringSchema).min(1),
  destination: NonEmptyStringSchema.optional(),
  itemCount: NonNegativeIntegerSchema,
  payloadDigest: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema
})

export type ApprovalEnvelope = z.infer<typeof ApprovalEnvelopeSchema>

export const SyncOperationSchema = z.object({
  operationId: NonEmptyStringSchema,
  entityType: NonEmptyStringSchema,
  entityId: NonEmptyStringSchema,
  actorId: NonEmptyStringSchema,
  tenantId: NonEmptyStringSchema.optional(),
  baseVersion: NonNegativeIntegerSchema,
  changedFields: z.array(NonEmptyStringSchema).min(1),
  payload: z.unknown(),
  createdAt: TimestampSchema
})

export type SyncOperation = z.infer<typeof SyncOperationSchema>

export const ConflictRecordSchema = z.object({
  id: NonEmptyStringSchema,
  operationId: NonEmptyStringSchema,
  entityType: NonEmptyStringSchema,
  entityId: NonEmptyStringSchema,
  fieldNames: z.array(NonEmptyStringSchema).min(1),
  baseValues: JsonRecordSchema,
  currentValues: JsonRecordSchema,
  incomingValues: JsonRecordSchema
})

export type ConflictRecord = z.infer<typeof ConflictRecordSchema>
