import { z } from 'zod';
import { PIPELINE_VERSION, type PipelineCommand, type RunCommand } from './outbound-pipeline';
export class PipelineError extends Error {
}
const kinds = ['list', 'membership', 'workflow', 'template', 'assessment', 'stage', 'recipient', 'draft', 'signal', 'location'];
function object(v: unknown): Record<string, unknown> {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        throw new PipelineError('pipeline_invalid_object');
    return v as Record<string, unknown>;
}
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_:.-]+$/), text = z.string().max(16000), short = z.string().min(1).max(500), nullable = id.nullable().default(null), stage = z.enum(['list', 'research', 'contacts', 'verify', 'write']);
const criterion = z.strictObject({
    id, label: short, instructions: text, required: z.boolean(), exclusion: z.boolean()
});
const copy = z.strictObject({
    subject: text, opener: text, body: text, cta: text, unsubscribe: short, followups: z.array(z.strictObject({
        delay_days: z.number().int().min(2), subject: text, body: text
    })).max(10)
});
const workflow = z.strictObject({
    offer_version_id: id, icp_version_id: id, icp_name: short.optional(), criteria: z.array(criterion).min(1).max(100), signals: z.array(z.strictObject({
        id, label: short, collection_instructions: text, acceptable_evidence: text, usefulness_guidance: text, writing_eligible: z.boolean(), value_type: z.enum(['text', 'number', 'boolean', 'date', 'list']), required: z.boolean()
    })).max(100), tools: z.array(z.strictObject({
        id, stage, fallback_on: z.array(z.enum(['empty', 'insufficient', 'retryable'])).max(3), missing_fields: z.array(id).max(100), max_attempts: z.number().int().min(1).max(10), cache_max_age_days: z.number().int().min(0).max(365)
    })).max(30), checkpoints: z.array(stage).max(5), target_roles: z.array(short).max(100), verification: z.strictObject({
        accepted: z.tuple([z.literal('valid')]), reuse_days: z.number().int().min(0).max(365)
    }), budget: z.strictObject({
        amount: z.number().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/)
    }), concurrency: z.number().int().min(1).max(20)
});
const template = copy.extend({
    mode: z.enum(['deterministic', 'ai']),
    variations: z.array(z.strictObject({
        id, name: short, enabled: z.boolean(), match: z.enum(['all', 'any']),
        when: z.array(z.strictObject({signal_id: id, operator: z.enum(['present', 'equals', 'contains']), value: text})
            .refine(rule => rule.operator === 'present' || Boolean(rule.value.trim()), 'A comparison value is required')).min(1).max(20),
        copy: copy.omit({followups: true})
    })).max(20).optional(), slots: z.record(z.string().regex(/^[a-zA-Z0-9_]+$/), z.strictObject({
        signal_ids: z.array(id).max(100), required: z.boolean(), fallback: text
    })), ai: z.strictObject({
        model: short, prompt: short
    }).optional()
}).refine(v => v.mode !== 'ai' || !!v.ai, 'AI policy required')
  .refine(v => v.mode !== 'ai' || !v.variations?.length, 'Signal variations require deterministic mode')
  .refine(v => new Set(v.variations?.map(item => item.id)).size === (v.variations?.length || 0), 'Variation IDs must be unique');
const recordSchemas = {
    location: z.strictObject({
        id, company_id: id, country_code: z.string().regex(/^[A-Z]{2}$/).nullable(), administrative_region: text.nullable(), city: text.nullable(), suburb: text.nullable(), postcode: text.nullable(), timezone: z.string().refine(v => {
            try {
                new Intl.DateTimeFormat('en', {
                    timeZone: v
                });
                return true;
            }
            catch {
                return false;
            }
        }, 'IANA timezone required').nullable()
    }),
    list: z.strictObject({
        id, name: short, notes: text.nullable().optional(), workflow_version_id: nullable, offer_version_id: nullable, icp_version_id: nullable
    }),
    membership: z.strictObject({
        id, list_id: id, company_id: id, active: z.boolean(), origin: short
    }),
    workflow: z.strictObject({
        id, name: short, parent_id: nullable, policy: workflow
    }),
    template: z.strictObject({
        id, name: short, parent_id: nullable, policy: template
    }),
    assessment: z.strictObject({
        id, company_id: id, workflow_version_id: id, input_revision: z.number().int().positive(), criteria: z.array(z.strictObject({
            id, required: z.boolean(), exclusion: z.boolean(), outcome: z.enum(['supported', 'failed', 'unknown']), evidence_ids: z.array(id).max(100)
        })).max(100), fit: z.enum(['unknown', 'anti_icp', 'non_fit', 'likely_fit', 'sure_fit']), reason: short, override_reason: text.nullable().default(null)
    }),
    stage: z.strictObject({
        id, list_id: id, company_id: id, recipient_id: nullable, workflow_version_id: id, stage, status: z.enum(['ready', 'held', 'completed', 'failed', 'stale']), reason: short, input_hash: short, output_refs: z.array(id).max(100), supersedes_id: nullable
    }),
    recipient: z.strictObject({
        id, list_id: id, company_id: id, candidate_id: id, method_id: id, mailbox: z.email(), suitable: z.boolean(), reason: short, lead_id: nullable
    }),
    draft: z.strictObject({
        id, list_id: id, recipient_id: id, template_version_id: id, copy, provenance: z.enum(['template', 'manual', 'ai', 'restore']), input_refs: z.array(id).max(100), previous_id: nullable
    }),
    signal: z.strictObject({
        id, company_id: id, workflow_version_id: id, signal_id: id, value: z.json(), source_id: id, observed_at: z.iso.datetime({
            offset: true
        }), quote: short, evidence_strength: z.enum(['none', 'low', 'medium', 'high']), usefulness: z.enum(['none', 'low', 'medium', 'high']), supersedes_id: nullable
    })
};
const filters = z.strictObject({
    q: text.optional(), city: short.optional(), suburb: short.optional(), country: z.string().regex(/^[A-Z]{2}$/).optional(), administrative_region: short.optional(), fit: z.enum(['unknown', 'anti_icp', 'non_fit', 'likely_fit', 'sure_fit']).optional(), stage: stage.optional(), status: short.optional(), draft_status:z.enum(['drafted','undrafted']).optional(),verification_status:z.enum(['valid','invalid','catch_all','unknown','risky','unverified']).optional()
});
const leased = {
    item_id: id, lease_token: id
};
const runSchemas = {
    start: z.strictObject({
        list_id: id, workflow_version_id: id, stage, company_ids: z.array(id).max(1000).optional(), recipient_ids:z.array(id).max(1000).optional(), filters: filters.optional(), verification_run_id: id.optional(), template_version_id: id.optional()
    }), claim: z.strictObject({}), heartbeat: z.strictObject(leased), reserve_attempt: z.strictObject({
        ...leased, attempt_id: id, tool_id: id, provider_request_id: id, estimated_cost: z.number().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/)
    }), report_attempt: z.strictObject({
        ...leased, attempt_id: id, status: z.enum(['completed', 'uncertain', 'failed']), outcome: z.enum(['empty', 'insufficient', 'retryable', 'success']).nullable(), actual_cost: z.number().nonnegative().nullable(), source_ids: z.array(id).max(100), duration_ms: z.number().int().nonnegative().nullable()
    }), finish_item: z.strictObject({
        ...leased, status: z.enum(['completed', 'held', 'failed']), result: z.strictObject({
            assessment_ids: z.array(id).max(100).optional(), recipient_ids: z.array(id).max(100).optional(), verification_ids: z.array(id).max(100).optional(), draft_ids: z.array(id).max(100).optional(), reason: text.optional()
        })
    }), checkpoint: z.strictObject({
        reason: short
    }), approve: z.strictObject({}), cancel: z.strictObject({}), resume: z.strictObject({})
};
export function parsePipelineCommand(input: unknown): PipelineCommand | RunCommand {
    const x = object(input);
    if (x.schema_version !== PIPELINE_VERSION || typeof x.request_id !== 'string' || x.request_id.length < 8 || x.request_id.length > 200 || typeof x.source !== 'string' || !x.source.trim())
        throw new PipelineError('pipeline_invalid_command');
    if (x.action) {
        if (!['start', 'claim', 'heartbeat', 'reserve_attempt', 'report_attempt', 'finish_item', 'checkpoint', 'approve', 'cancel', 'resume'].includes(String(x.action)) || typeof x.run_id !== 'string' || !Number.isInteger(x.expected_revision))
            throw new PipelineError('pipeline_invalid_run_command');
        object(x.data);
        try {
            x.data = runSchemas[x.action as keyof typeof runSchemas].parse(x.data);
        }
        catch (error) {
            throw new PipelineError('pipeline_invalid_run_data: ' + (error instanceof Error ? error.message : 'invalid'));
        }
        ;
        return x as unknown as RunCommand;
    }
    if (!Array.isArray(x.operations) || !x.operations.length || x.operations.length > 100)
        throw new PipelineError('pipeline_invalid_operations');
    for (const raw of x.operations) {
        const op = object(raw);
        const r = object(op.record);
        if (!kinds.includes(String(op.kind)) || !Number.isInteger(op.expected_revision) || Number(op.expected_revision) < 0 || typeof r.id !== 'string' || !r.id || Object.keys(r).some(k => ['actor', 'revision', 'created_at', 'updated_at', 'approved'].includes(k)))
            throw new PipelineError('pipeline_invalid_operation');
    }
    try {
        x.operations = x.operations.map(raw => {
            const op = raw as {
                kind: keyof typeof recordSchemas;
                record: unknown;
                expected_revision: number;
            };
            return {
                ...op, record: recordSchemas[op.kind].parse(op.record)
            };
        });
    }
    catch (error) {
        throw new PipelineError('pipeline_invalid_record: ' + (error instanceof Error ? error.message : 'invalid'));
    }
    ;
    return x as unknown as PipelineCommand;
}
export function canonicalPipeline(value: unknown): string {
    if (Array.isArray(value))
        return '[' + value.map(canonicalPipeline).join(',') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonicalPipeline(v)).join(',') + '}';
    return JSON.stringify(value);
}
