/** Shared durable outbound contract. IDs reuse CRM/list identities; new IDs are UUIDs. */
export const PIPELINE_VERSION = 'outbound.pipeline.v1' as const;
export type PipelineStage = 'list' | 'research' | 'contacts' | 'verify' | 'write';
export type Fit = 'unknown' | 'anti_icp' | 'non_fit' | 'likely_fit' | 'sure_fit';
export type Strength = 'none' | 'low' | 'medium' | 'high';
export type Criterion = {
    id: string;
    required: boolean;
    exclusion: boolean;
    outcome: 'supported' | 'failed' | 'unknown';
    evidence_ids: string[];
};
export type SignalDefinition = {
    id: string;
    label: string;
    collection_instructions: string;
    acceptable_evidence: string;
    usefulness_guidance: string;
    writing_eligible: boolean;
    value_type: 'text' | 'number' | 'boolean' | 'date' | 'list';
    required: boolean;
};
export type ToolPolicy = {
    id: string;
    stage: PipelineStage;
    fallback_on: ('empty' | 'insufficient' | 'retryable')[];
    missing_fields: string[];
    max_attempts: number;
    cache_max_age_days: number;
};
export type WorkflowPolicy = {
    offer_version_id: string;
    icp_version_id: string;
    icp_name?: string;
    criteria: {
        id: string;
        label: string;
        instructions: string;
        required: boolean;
        exclusion: boolean;
    }[];
    signals: SignalDefinition[];
    tools: ToolPolicy[];
    checkpoints: PipelineStage[];
    target_roles: string[];
    verification: {
        accepted: [
            'valid'
        ];
        reuse_days: number;
    };
    budget: {
        amount: number;
        currency: string;
    };
    concurrency: number;
};
export type TemplatePolicy = {
    mode: 'deterministic' | 'ai';
    subject: string;
    opener: string;
    body: string;
    cta: string;
    unsubscribe: string;
    slots: Record<string, {
        signal_ids: string[];
        required: boolean;
        fallback: string;
    }>;
    ai?: {
        model: string;
        prompt: string;
    };
    followups: {
        delay_days: number;
        subject: string;
        body: string;
    }[];
};
export type Copy = {
    subject: string;
    opener: string;
    body: string;
    cta: string;
    unsubscribe: string;
    followups: {
        delay_days: number;
        subject: string;
        body: string;
    }[];
};
export type Stored = {
    id: string;
    revision: number;
    created_at: string;
    updated_at: string;
    actor: string;
};
export type PipelineList = Stored & {
    name: string;
    notes: string | null;
    workflow_version_id: string | null;
    offer_version_id: string | null;
    icp_version_id: string | null;
};
export type PipelineCompany = {
    id: string;
    name: string;
    country: string;
    website: string | null;
    revision: number;
    input_revision: number;
    list_id: string | null;
    membership_id: string | null;
    fit: Fit;
    eligibility_override: boolean;
    stage: PipelineStage | null;
    stage_status: string | null;
    reason: string | null;
    city: string | null;
    suburb: string | null;
    administrative_region: string | null;
    timezone: string | null;
};
export type Membership = Stored & {
    list_id: string;
    company_id: string;
    active: boolean;
    origin: string;
};
export type WorkflowVersion = Stored & {
    name: string;
    parent_id: string | null;
    policy: WorkflowPolicy;
};
export type TemplateVersion = Stored & {
    name: string;
    parent_id: string | null;
    policy: TemplatePolicy;
};
export type Assessment = Stored & {
    company_id: string;
    workflow_version_id: string;
    input_revision: number;
    criteria: Criterion[];
    fit: Fit;
    reason: string;
    override_reason: string | null;
};
export type StageResult = Stored & {
    list_id: string;
    company_id: string;
    recipient_id: string | null;
    workflow_version_id: string;
    stage: PipelineStage;
    status: 'ready' | 'held' | 'completed' | 'failed' | 'stale';
    reason: string;
    input_hash: string;
    output_refs: string[];
    supersedes_id: string | null;
};
export type Recipient = Stored & {
    company_name?: string;
    name?: string | null;
    role?: string | null;
    current_draft_id?: string | null;
    mailbox_result?: string | null;
    checked_at?: string | null;
    suppressed?: boolean;
    eligibility?: string;
    attribution_status?: string;
    list_id: string;
    company_id: string;
    candidate_id: string;
    method_id: string;
    mailbox: string;
    suitable: boolean;
    reason: string;
    lead_id: string | null;
};
export type Draft = Stored & {
    list_id: string;
    recipient_id: string;
    template_version_id: string;
    copy: Copy;
    provenance: 'template' | 'manual' | 'ai' | 'restore';
    input_refs: string[];
    previous_id: string | null;
    approved: boolean;
};
export type PipelineRun = Stored & {
    list_id: string;
    workflow_version_id: string;
    stage: PipelineStage;
    status: 'queued' | 'running' | 'checkpoint' | 'blocked' | 'completed' | 'cancelled' | 'failed';
    scope_count: number;
    checkpoint_reason: string | null;
};
export type WorkItem = Stored & {
    run_id: string;
    company_id: string;
    recipient_id: string | null;
    status: 'queued' | 'running' | 'completed' | 'held' | 'failed';
    lease_token: string | null;
    lease_until: string | null;
    result: Record<string, unknown>;
};
export type Attempt = Stored & {
    item_id: string;
    tool_id: string;
    provider_request_id: string;
    status: 'reserved' | 'completed' | 'uncertain' | 'failed';
    estimated_cost: number;
    actual_cost: number | null;
    currency: string;
    outcome: 'empty' | 'insufficient' | 'retryable' | 'success' | null;
    source_ids: string[];
    duration_ms: number | null;
};
export type PipelinePage<T = Record<string, unknown>> = {
    schema_version: typeof PIPELINE_VERSION;
    records: T[];
    next_after: string | null;
    total_matching: number;
};
export type PipelineCapabilities = {
    schema_version: typeof PIPELINE_VERSION;
    enabled: boolean;
    writable: boolean;
    schema_ready: boolean;
    surface_ready: boolean;
    reason: string | null;
    executor: 'connected_agent';
    automatic_paid_execution: false;
    activation: false;
};
export type RecordKind = 'list' | 'membership' | 'workflow' | 'template' | 'assessment' | 'stage' | 'recipient' | 'draft' | 'signal' | 'location';
export type PipelineOperation = {
    kind: RecordKind;
    record: Record<string, unknown>;
    expected_revision: number;
};
export type PipelineCommand = {
    schema_version: typeof PIPELINE_VERSION;
    request_id: string;
    source: string;
    operations: PipelineOperation[];
};
export type RunCommand = {
    schema_version: typeof PIPELINE_VERSION;
    request_id: string;
    source: string;
    action: 'start' | 'claim' | 'heartbeat' | 'reserve_attempt' | 'report_attempt' | 'finish_item' | 'checkpoint' | 'approve' | 'cancel' | 'resume';
    run_id: string;
    expected_revision: number;
    data: Record<string, unknown>;
};
export type PipelineReceipt = {
    request_id: string;
    results: {
        id: string;
        kind: string;
        revision: number;
    }[];
};
export const PIPELINE_COLLECTIONS = ['lists', 'companies', 'memberships', 'workflows', 'templates', 'assessments', 'stages', 'recipients', 'drafts', 'runs', 'items', 'attempts', 'signals', 'receipts'] as const;
export function assessFit(criteria: Criterion[]): Fit {
    if (criteria.some(c => c.exclusion && c.outcome === 'supported'))
        return 'anti_icp';
    if (criteria.some(c => c.required && !c.exclusion && c.outcome === 'failed'))
        return 'non_fit';
    const required = criteria.filter(c => c.required && !c.exclusion);
    if (required.length && required.every(c => c.outcome === 'supported'))
        return 'sure_fit';
    return criteria.some(c => !c.exclusion && c.outcome === 'supported') ? 'likely_fit' : 'unknown';
}
export function renderPipelineTemplate(policy: TemplatePolicy, signals: Record<string, string>): {
    copy: Copy;
    missing: string[];
} {
    if (policy.mode !== 'deterministic')
        throw new Error('pipeline_ai_executor_required');
    const missing = new Set<string>();
    const render = (text: string) => text.replace(/\[\[([a-zA-Z0-9_]+)\]\]/g, (_, key: string) => {
        const slot = policy.slots[key];
        if (!slot) {
            missing.add(key);
            return '';
        }
        const value = slot.signal_ids.map(id => signals[id]).find(v => typeof v === 'string' && v.trim());
        if (value)
            return value;
        if (slot.required && !slot.fallback)
            missing.add(key);
        return slot.fallback;
    });
    return {
        copy: {
            subject: render(policy.subject), opener: render(policy.opener), body: render(policy.body), cta: render(policy.cta), unsubscribe: render(policy.unsubscribe), followups: policy.followups.map(f => ({
                ...f, subject: render(f.subject), body: render(f.body)
            }))
        }, missing: [...missing]
    };
}
export type SignalObservation = Stored & {
    company_id: string;
    workflow_version_id: string;
    signal_id: string;
    value: unknown;
    source_id: string;
    observed_at: string;
    quote: string;
    evidence_strength: Strength;
    usefulness: Strength;
    supersedes_id: string | null;
};

/** Stable text representation shared by preview, frozen jobs and copy rendering. */
export function serializePipelineSignal(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value) && value.every(v => ['string','number','boolean'].includes(typeof v))) return value.map(String).join(', ');
    return '';
}
