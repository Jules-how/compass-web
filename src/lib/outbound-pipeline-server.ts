import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PIPELINE_VERSION, PIPELINE_COLLECTIONS, type PipelineCapabilities } from "./outbound-pipeline";
import { canonicalPipeline, parsePipelineCommand, PipelineError } from "./outbound-pipeline-schema";
const tables: Record<string, string> = {
    lists: "compass_lead_lists", memberships: "outbound_pipeline_memberships", workflows: "outbound_pipeline_workflows", templates: "outbound_pipeline_templates", assessments: "outbound_pipeline_assessments", stages: "outbound_pipeline_stages", recipients: "outbound_pipeline_recipient_profiles", drafts: "outbound_pipeline_drafts", signals: "outbound_pipeline_signals", runs: "outbound_pipeline_runs", items: "outbound_pipeline_items", attempts: "outbound_pipeline_attempts", receipts: "outbound_pipeline_receipts"
};
export function pipelineDatabaseError(error: {
    code?: string;
    message: string;
} | null) {
    if (error)
        throw new PipelineError(["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code || "") ? "pipeline_schema_unavailable" : error.message);
}
export function requirePipeline(write = false) {
    if (process.env.COMPASS_OUTBOUND_PIPELINE !== "1" || process.env.COMPASS_CRM_RESEARCH !== "1")
        throw new PipelineError("pipeline_disabled");
    if (write && (process.env.COMPASS_OUTBOUND_PIPELINE_WRITES !== "1" || process.env.COMPASS_CRM_RESEARCH_WRITES !== "1"))
        throw new PipelineError("pipeline_read_only");
}
export async function pipelineCapabilities(db: SupabaseClient): Promise<PipelineCapabilities> {
    const enabled = process.env.COMPASS_OUTBOUND_PIPELINE === "1" && process.env.COMPASS_CRM_RESEARCH === "1";
    const base = {
        schema_version: PIPELINE_VERSION, enabled, writable: false, schema_ready: false, surface_ready: false, reason: enabled ? null : "pipeline_disabled", executor: "connected_agent" as const, automatic_paid_execution: false as const, activation: false as const
    };
    if (!enabled)
        return base;
    const result = await db.rpc("outbound_pipeline_capabilities");
    if (result.error)
        return {
            ...base, reason: "pipeline_schema_unavailable"
        };
    return {
        ...base, schema_ready: true, surface_ready: process.env.COMPASS_OUTBOUND_PIPELINE_SURFACE === "1", writable: process.env.COMPASS_OUTBOUND_PIPELINE_WRITES === "1" && process.env.COMPASS_CRM_RESEARCH_WRITES === "1"
    };
}
export async function applyPipelineCommand(db: SupabaseClient, input: unknown, actor: string) {
    requirePipeline(true);
    const command = parsePipelineCommand(input);
    if ("action" in command && command.action === "approve" && !actor.startsWith("operator:"))
        throw new PipelineError("pipeline_operator_required");
    const hash = createHash("sha256").update(canonicalPipeline(command)).digest("hex");
    const result = await db.rpc("action" in command ? "outbound_pipeline_run" : "outbound_pipeline_apply", {
        p_command: command, p_hash: hash, p_actor: actor
    });
    pipelineDatabaseError(result.error);
    return result.data;
}
export async function readPipeline(db: SupabaseClient, params: URLSearchParams) {
    requirePipeline();
    const collection = params.get("collection") || "lists";
    if (!(PIPELINE_COLLECTIONS as readonly string[]).includes(collection))
        throw new PipelineError("pipeline_invalid_collection");
    const allowed = ["collection", "list_id", "company_id", "run_id", "recipient_id", "item_id", "workflow_version_id", "id", "after", "limit", "q", "city", "suburb", "country", "fit", "stage", "status", "fields", "changed_since", "request_id", "draft_status", "verification_status"];
    for (const key of params.keys())
        if (!allowed.includes(key))
            throw new PipelineError("pipeline_invalid_filter");
    const limit = Number(params.get("limit") || 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new PipelineError("pipeline_invalid_limit");
    const fingerprint = createHash("sha256").update(canonicalPipeline(Object.fromEntries([...params.entries()].filter(([k]) => !["after", "limit", "fields"].includes(k)).sort()))).digest("hex");
    let after: string | null = null;
    if (params.get("after")) {
        try {
            const cursor = JSON.parse(Buffer.from(params.get("after")!, "base64url").toString());
            if (cursor.scope !== fingerprint || typeof cursor.id !== "string")
                throw new Error();
            after = cursor.id;
        }
        catch {
            throw new PipelineError("pipeline_cursor_scope_conflict");
        }
    }
    let query;
    if (collection === "receipts") {
        if (!params.get("request_id"))
            throw new PipelineError("pipeline_request_id_required");
        const receipt = await db.from(tables.receipts).select("request_id,payload_hash,actor,source,receipt,created_at").eq("request_id", params.get("request_id")!).maybeSingle();
        pipelineDatabaseError(receipt.error);
        return {
            schema_version: PIPELINE_VERSION, records: receipt.data ? [receipt.data] : [], next_after: null, total_matching: receipt.data ? 1 : 0
        };
    }
    if (collection === "companies") {
        for (const key of ["run_id", "recipient_id", "item_id", "workflow_version_id", "changed_since", "request_id"]) {
            if (params.has(key)) throw new PipelineError("pipeline_invalid_scope");
        }
        const filters: Record<string, string> = {};
        for (const key of ["list_id", "q", "city", "suburb", "country", "fit", "stage", "status"])
            if (params.has(key))
                filters[key] = params.get(key)!;
        query = db.rpc("outbound_pipeline_companies", {
            p_filters: filters
        }, {count: "exact"}).select("*");
        if (params.has("id"))
            query = query.eq("id", params.get("id")!);
        if (params.has("company_id"))
            query = query.eq("id", params.get("company_id")!);
    }
    else if (collection === "recipients") {
        const filters: Record<string,string> = {};
        for (const key of ["list_id","q","city","suburb","country","fit","stage","status","draft_status","verification_status"]) if(params.has(key)) filters[key]=params.get(key)!;
        query=db.rpc("outbound_pipeline_recipients",{p_filters:filters},{count:"exact"}).select("*");
        for(const key of ["id","company_id"]) if(params.has(key)) query=query.eq(key,params.get(key)!);
        if(params.has("changed_since")) query=query.gt("updated_at",params.get("changed_since")!);
        for(const key of ["run_id","recipient_id","item_id","workflow_version_id","request_id"]) if(params.has(key)) throw new PipelineError("pipeline_invalid_scope");
    }
    else {
        for (const key of ["city", "suburb", "country", "fit", "request_id"]) {
            if (params.has(key)) throw new PipelineError("pipeline_invalid_scope");
        }
        query = db.from(tables[collection]).select("*", {
            count: "exact"
        });
        if (params.has("q")) {
            if (!["lists", "workflows", "templates"].includes(collection)) throw new PipelineError("pipeline_invalid_scope");
            query = query.ilike("name", "%" + params.get("q")! + "%");
        }
        const scopes: Record<string, string[]> = {
            lists: ["id"], workflows: ["id"], templates: ["id"], memberships: ["id", "list_id", "company_id"], assessments: ["id", "company_id", "workflow_version_id"], stages: ["id", "list_id", "company_id", "recipient_id", "workflow_version_id", "stage", "status"], recipients: ["id", "list_id", "company_id"], drafts: ["id", "list_id", "recipient_id"], signals: ["id", "company_id", "workflow_version_id"], runs: ["id", "list_id", "workflow_version_id", "status"], items: ["id", "run_id", "company_id", "recipient_id", "status"], attempts: ["id", "item_id", "status"]
        };
        for (const key of ["id", "list_id", "company_id", "run_id", "recipient_id", "item_id", "workflow_version_id", "stage", "status"])
            if (params.has(key)) {
                if (!scopes[collection].includes(key))
                    throw new PipelineError("pipeline_invalid_scope");
                query = query.eq(key, params.get(key)!);
            }
        if (params.has("changed_since")) {
            if (!Number.isFinite(Date.parse(params.get("changed_since")!)))
                throw new PipelineError("pipeline_invalid_timestamp");
            query = query.gt("updated_at", params.get("changed_since")!);
        }
    }
    const count = await query.limit(0);
    pipelineDatabaseError(count.error);
    if (after)
        query = query.gt("id", after);
    const result = await query.order("id").limit(limit + 1);
    pipelineDatabaseError(result.error);
    let records = (result.data || []).slice(0, limit) as Record<string, unknown>[];
    const next_after = (result.data || []).length > limit ? Buffer.from(JSON.stringify({
        scope: fingerprint, id: String(records.at(-1)?.id)
    })).toString("base64url") : null;
    const fields = params.get("fields")?.split(",").filter(Boolean);
    if (fields) {
        if (fields.length > 30 || fields.some(f => !/^[a-z_]+$/.test(f)))
            throw new PipelineError("pipeline_invalid_fields");
        records = records.map(r => Object.fromEntries(["id", ...fields].filter(k => k in r).map(k => [k, r[k]])));
    }
    return {
        schema_version: PIPELINE_VERSION, records, next_after, total_matching: count.count || 0
    };
}
