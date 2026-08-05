import { z } from 'zod'
import { CommandContextSchema, PageSchema } from './contracts'

const nonEmpty = z.string().trim().min(1)

export const ContactCompletenessSchema = z.enum([
  'any', 'has-phone', 'no-phone', 'has-email', 'no-email'
])
export const ContactStateSchema = z.enum(['any', 'contacted', 'never'])
export const ContactChannelSchema = z.enum(['any', 'call', 'sms', 'email'])
export const ContactReviewStateSchema = z.enum([
  'any', 'needs-review', 'not-uploaded', 'in-instantly', 'stale-sync',
  'missing-context', 'suppressed', 'category-verified', 'category-wrong-fit', 'category-review',
  'email-unverified', 'email-risky', 'email-bad'
])

// Cursors are an opaque versioned base64url payload. Shape validation here
// prevents accidental use of numeric offsets; signature/tuple validation lives
// in the query service, where the ordering contract is known.
export const ContactCursorSchema = z.string().regex(/^cc1\.[A-Za-z0-9_-]+\.[a-f0-9]{16}$/)

export const ContactQuerySchema = z.object({
  cursor: ContactCursorSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
  query: z.string().trim().max(500).optional(),
  listId: nonEmpty.optional(),
  vertical: nonEmpty.optional(),
  outboundState: nonEmpty.optional(),
  completeness: ContactCompletenessSchema.default('any'),
  contactState: ContactStateSchema.default('any'),
  channel: ContactChannelSchema.default('any'),
  staleDays: z.number().int().nonnegative().max(36500).optional(),
  reviewState: ContactReviewStateSchema.default('any'),
  leadOnly: z.boolean().default(false)
})

export type ContactQuery = z.input<typeof ContactQuerySchema>

export const ContactProjectionSchema = z.object({
  id: nonEmpty,
  name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  vertical: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  tags: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  listIds: z.string().nullable().optional(),
  outboundStatus: z.string().nullable().optional(),
  recontactOk: z.number().int().nullable().optional(),
  suppressionReason: z.string().nullable().optional(),
  recordVersion: z.number().int().nonnegative(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
}).passthrough()

export type ContactProjection = z.infer<typeof ContactProjectionSchema>
export const ContactPageSchema = PageSchema(ContactProjectionSchema)

export const ContactSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  filtered: z.number().int().nonnegative(),
  contacted: z.number().int().nonnegative(),
  neverContacted: z.number().int().nonnegative(),
  withEmail: z.number().int().nonnegative(),
  withPhone: z.number().int().nonnegative(),
  suppressed: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative().default(0),
  notUploaded: z.number().int().nonnegative().default(0),
  inInstantly: z.number().int().nonnegative().default(0),
  staleSync: z.number().int().nonnegative().default(0),
  missingContext: z.number().int().nonnegative().default(0),
  unverifiedEmail: z.number().int().nonnegative().default(0),
  riskyEmail: z.number().int().nonnegative().default(0),
  badEmail: z.number().int().nonnegative().default(0),
  listCounts: z.record(z.string(), z.number().int().nonnegative()),
  verticalCounts: z.record(z.string(), z.number().int().nonnegative())
})

export type ContactSummary = z.infer<typeof ContactSummarySchema>

const patch = z.record(z.string(), z.unknown()).refine(
  (value) => Object.keys(value).length > 0,
  'contact patch must contain at least one field'
)

export const ContactCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('upsert'),
    context: CommandContextSchema,
    contactId: nonEmpty.optional(),
    patch
  }),
  z.object({
    type: z.literal('delete'),
    context: CommandContextSchema,
    contactId: nonEmpty
  }),
  z.object({
    type: z.literal('merge'),
    context: CommandContextSchema,
    survivorId: nonEmpty,
    loserId: nonEmpty
  }).refine((value) => value.survivorId !== value.loserId, 'merge contacts must differ'),
  z.object({
    type: z.literal('split'),
    context: CommandContextSchema,
    sourceId: nonEmpty,
    newContactId: nonEmpty,
    keyIds: z.array(nonEmpty).default([]),
    provenanceIds: z.array(nonEmpty).default([]),
    patch: patch.optional()
  }).refine((value) => value.sourceId !== value.newContactId, 'split contacts must differ')
])

export type ContactCommand = z.infer<typeof ContactCommandSchema>

export const ContactCommandResultSchema = z.object({
  operationId: nonEmpty,
  status: z.enum(['applied', 'conflict', 'noop']),
  contact: ContactProjectionSchema.optional(),
  conflictIds: z.array(nonEmpty).default([]),
  affectedIds: z.array(nonEmpty).default([])
})

export type ContactCommandResult = z.infer<typeof ContactCommandResultSchema>
