export type PipelineReadback = {
    id: string;
    manifest_id: string;
    phase: 'baseline' | 'reconcile';
    baseline_id: string | null;
    status: 'scanning' | 'comparing' | 'complete' | 'attention';
    revision: number;
    cursor: string | null;
    page_count: number;
    scanned_count: number;
    compare_after: string | null;
    approved: boolean;
    summary: {
        compared?: number;
        intended?: number;
        observed?: number;
        confirmed?: number;
        missing?: number;
        copy_conflicts?: number;
        unexpected?: number;
        duplicates?: number;
        baseline_missing?: number;
        baseline_changed?: number;
        complete?: boolean;
        error?: string;
        observed_at?: string;
    };
    created_at: string;
    finished_at: string | null;
};
export type PipelineReadbackResult = {
    readback_id: string;
    item_id: string;
    recipient_id: string;
    email: string;
    status: 'confirmed' | 'missing' | 'variables_mismatch' | 'conflict';
    provider_id: string | null;
};
