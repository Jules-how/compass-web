import { compileStepBody, type OutboundSequence } from './outbound-copy';
import { digest, type Context, type Candidate, type Rendered, type Assessed } from './outbound-preparation';
import type { Copy } from './outbound-pipeline';
export type DeliveryManifest = {
    id: string;
    list_id: string;
    campaign_id: string;
    workflow_version_id: string;
    template_version_id: string;
    verification_run_id: string | null;
    revision: number;
    status: 'building' | 'review' | 'reserved' | 'checking' | 'complete' | 'attention';
    context: Context;
    total_count: number;
    pass_count: number;
    hold_count: number;
    hash: string | null;
    created_at: string;
    updated_at: string;
};
export type DeliveryItem = {
    id: string;
    manifest_id: string;
    recipient_id: string;
    status: 'queued' | 'pass' | 'hold';
    snapshot: {
        recipient: Record<string, unknown>;
        company: Record<string, unknown>;
        draft: {
            id: string;
            copy: Copy;
            template_version_id: string;
        } | null;
        verification: Record<string, unknown> | null;
        input_revision: number;
        lead: Record<string, unknown> | null;
        reasons: string[];
    };
    record: Assessed | null;
};
export function validatePipelineSendContext(context: Context): string[] { const errors: string[] = []; const s = context.settings; try {
    new Intl.DateTimeFormat('en', {
        timeZone: s.timezone
    });
}
catch {
    errors.push('valid_iana_timezone_required');
} if (!s.email_list?.length || s.email_list.some(e => !/^\S+@\S+\.\S+$/.test(e)) || !Number.isInteger(s.daily_limit) || s.daily_limit < 1 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.from) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.to) || s.from >= s.to)
    errors.push('review_send_settings'); if (!context.sequence?.steps?.length)
    errors.push('campaign_sequence_required'); context.sequence?.steps?.forEach((step, i) => { if (i > 0 && Number(step.delay_days) < 2)
    errors.push('two_day_gap_required'); if (!step.subject || !compileStepBody(step, {
    includeCompliance: true
}).trim())
    errors.push('empty_campaign_step'); }); return errors; }
/** Reuse provider shape and exact existing sequence; reject incompatible per-recipient copy. */
export function buildPipelineDeliveryItem(item: DeliveryItem, context: Context): Assessed { const s = item.snapshot, r = s.recipient, copy = s.draft?.copy; const reasons = [
    ...s.reasons
]; const company = String(s.company.name || ''); const mailbox = String(r.mailbox || ''); const name = typeof r.name === 'string' ? r.name : ''; const candidate: Candidate = {
    id: String(r.id), company_id: String(r.company_id), lead_id: typeof s.lead?.id === 'string' ? s.lead.id : null, company, website: String(s.company.website || ''), email: mailbox, evidence: [], identity_reviewed: false
}; if (!copy)
    return {
        candidate, status: 'hold', reasons: [
            ...reasons, 'current_draft_required'
        ], rendered: null
    }; const values: Record<string, string> = {
    email: mailbox, company_name: company, website: candidate.website, first_name: name ? name.split(/\s+/)[0] : '', firstName: name ? name.split(/\s+/)[0] : '', personalization: copy.opener, opener: copy.opener, subject: copy.subject
}; const desired = [
    {
        subject: copy.subject, body: [
            copy.opener, copy.body, copy.cta, copy.unsubscribe
        ].filter(Boolean).join('\n\n')
    }, ...copy.followups.map(f => ({
        subject: f.subject, body: f.body
    }))
]; if (context.pipeline?.copy_mode === 'recipient_variables')
    desired.forEach((step, i) => { values['pipeline_subject_' + (i + 1)] = step.subject; values['pipeline_body_' + (i + 1)] = step.body; }); const replace = (text: string) => text.replace(/\{\{([^}]+)\}\}/g, (full, key: string) => key === 'unsubscribe' ? full : Object.hasOwn(values, key) ? values[key] : full); const actual = context.sequence.steps.map(step => ({
    subject: replace(step.subject), body: replace(compileStepBody(step, {
        includeCompliance: true
    }))
})); const normalized = (v: string) => v.replace(/\r\n/g, '\n').trim(); if (actual.length !== desired.length || actual.some((step, i) => normalized(step.subject) !== normalized(desired[i]?.subject || '') || normalized(step.body) !== normalized(desired[i]?.body || '')))
    reasons.push('provider_sequence_cannot_express_draft'); if (!copy.unsubscribe.trim())
    reasons.push('visible_opt_out_required'); const rendered: Rendered = {
    candidate_id: candidate.id, values, steps: desired
}; return {
    candidate, status: reasons.length ? 'hold' : 'pass', reasons: [
        ...new Set(reasons)
    ], rendered: reasons.length ? null : rendered
}; }
export function deliveryItemDigest(item: DeliveryItem) { return digest(item.snapshot); }
export function pipelineVariableSequence(source: OutboundSequence, count: number): OutboundSequence {
    if (!Number.isInteger(count) || count < 1 || count > 10)
        throw new Error('pipeline_invalid_step_count');
    return {
        structure_id: 'pipeline-exact-draft', steps: Array.from({
            length: count
        }, (_, i) => ({
            id: 'pipeline-step-' + (i + 1), kind: i === 0 ? 'email' : 'followup', label: i === 0 ? 'Initial email' : 'Follow-up ' + i, delay_days: i === 0 ? 0 : Math.max(2, source.steps[i]?.delay_days || 2), subject: '{{pipeline_subject_' + (i + 1) + '}}', slots: [
                {
                    key: 'custom', label: 'Exact recipient body', body: '{{pipeline_body_' + (i + 1) + '}}'
                }
            ]
        }))
    };
}
