import { z } from "zod";
const id = z.string().trim().min(1).max(180);
const text = z.string().trim().max(8000);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid calendar date.",
  );
const evidence = z.array(id).max(40).default([]);
export const linkCommand = z
  .object({
    action: z.literal("link"),
    goal_id: id,
    work_type: z.enum(["project", "task", "checkpoint", "goal"]),
    work_id: id,
    relation: z.enum(["contributes", "hypothesis"]),
    state: z.enum(["active", "proposed"]),
    rationale: text.default(""),
    updated_at: z.string().optional(),
  })
  .strict();
export const observationCommand = z
  .object({
    action: z.literal("observe"),
    goal_id: id,
    goal_revision: z.number().int().positive(),
    idempotency_key: id,
    provenance: z.enum(["measured", "reported", "estimate"]),
    value: z.number().finite().nullable().default(null),
    accepted: z.boolean().nullable().default(null),
    source: text.min(1),
    detail: text.default(""),
    period_start: day,
    period_end: day,
    observed_at: z.string().datetime({ offset: true }),
    evidence_ids: evidence,
  })
  .strict()
  .refine(
    (v) => v.period_start <= v.period_end,
    "The reporting period ends before it starts.",
  )
  .refine(
    (v) => (v.value !== null) !== (v.accepted !== null),
    "Supply either a measured value or an acceptance result.",
  );
export const issueCommand = z
  .object({
    action: z.literal("review"),
    goal_id: id,
    issue_key: z.string().regex(/^[a-z0-9][a-z0-9:._-]{2,159}$/),
    revision: z.number().int().nonnegative().default(0),
    title: text.min(1).max(200),
    symptom: text.min(1),
    hypothesis: text.default(""),
    alternatives: text.default(""),
    next_action: text.min(1),
    expected_benefit: text.default(""),
    effort_minutes: z
      .number()
      .int()
      .min(0)
      .max(100000)
      .nullable()
      .default(null),
    uncertainty: text.default(""),
    prerequisites: text.default(""),
    opportunity_cost: text.default(""),
    review_on: day.nullable().default(null),
    source: text.min(1),
    evidence_ids: evidence,
    status: z
      .enum(["open", "watching", "resolved", "dismissed"])
      .default("open"),
  })
  .strict();
export const commandSchema = z.union([
  linkCommand,
  observationCommand,
  issueCommand,
  z
    .object({
      action: z.literal("create_task"),
      issue_id: z.string().uuid(),
      existing_task_id: id.optional(),
    })
    .strict(),
]);
