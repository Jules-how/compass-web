import { z } from 'zod';
import { copyControlIssues } from './copy-control';
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_:.-]+$/);
const text = z.string().max(16000), name = z.string().trim().min(1).max(160);
const slotKey = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_]+$/).refine(v => !['__proto__', 'constructor', 'prototype'].includes(v));
const kind = z.enum(['subject', 'opener', 'body', 'cta', 'unsubscribe', 'custom']);
const signal = z.strictObject({ id, category: name, value: text, evidence_ids: z.array(id).max(100), source_ids: z.array(id).max(100), strength: z.number().int().min(0).max(3), usefulness: z.number().int().min(0).max(3), observed_at: z.string().max(80), slot: slotKey, selection: z.enum(['priority', 'strongest', 'override']) });
export const copyControlSchema = z.strictObject({
  version: z.literal(1),
  components: z.array(z.strictObject({
    id, kind, name, enabled: z.boolean(), position: z.enum(['after_opener', 'after_body', 'after_cta']), selection: z.enum(['priority', 'auto']), pinned_variant_id: id.nullable(),
    variants: z.array(z.strictObject({
      id, name, enabled: z.boolean(), mode: z.enum(['template', 'ai']), text, instructions: text,
      slots: z.record(slotKey, z.strictObject({ signal_ids: z.array(id).max(100), selection: z.enum(['priority', 'strongest']), required: z.boolean(), fallback: text })).refine(v => Object.keys(v).length <= 100, 'At most 100 variables per variant'),
      when: z.array(z.strictObject({ signal_id: id, operator: z.enum(['present', 'equals', 'contains']), value: text }).refine(v => v.operator === 'present' || Boolean(v.value.trim()), 'Comparison value required')).max(100), match: z.enum(['all', 'any']),
    })).min(1).max(100),
  })).min(5).max(30),
  experiment: z.strictObject({ id, name, enabled: z.boolean(), component_id: id, variant_ids: z.tuple([id, id]), salt: id }).nullable(),
}).superRefine((value, ctx) => { for (const message of copyControlIssues(value)) ctx.addIssue({ code: 'custom', message }); });
export const copyControlTraceSchema = z.strictObject({
  version: z.literal(1), algorithm: z.literal('copy-control.v1'),
  template_version_id: id.nullable(), workflow_version_id: id.nullable(), list_id: id.nullable(), recipient_id: id.nullable(), company_id: id.nullable(), campaign_id: id.nullable(), synthetic: z.boolean(),
  available_signal_ids: z.array(id).max(100), signal_combination: z.array(name).max(100),
  components: z.array(z.strictObject({ component_id: id, kind, variant_id: id, variant_name: name, mode: z.enum(['template', 'ai']), text, signals: z.array(signal).max(100), fallback_slots: z.array(slotKey).max(100) })).max(30),
  experiment: z.strictObject({ id, eligible: z.boolean(), arm: id.nullable(), reason: text.nullable() }).nullable(), human_edited: z.boolean().optional(),
});
export const copyOutcomeSchema = z.strictObject({ source_event_id: name, message_id: name, campaign_id: id, draft_id: id, type: z.enum(['sent', 'delivered', 'bounced', 'reply', 'positive_reply', 'booking']), occurred_at: z.iso.datetime({ offset: true }), provider: name, automatic: z.boolean().default(false) });
