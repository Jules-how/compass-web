import "server-only";
import { createHash } from "node:crypto";
import { CrmValidationError } from "./crm-research-schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CRM_TABLES,
  crmDatabaseError,
  requireCrmResearch,
} from "./crm-research-server";
import {
  legacyBridgeCommandSchema,
  legacyId,
  legacyOperations,
  type LegacyLead,
} from "./crm-legacy-import";
import { canonicalPipeline } from "./outbound-pipeline-schema";
import { requirePipeline } from "./outbound-pipeline-server";
export async function bridgeLegacyCrm(
  db: SupabaseClient,
  input: unknown,
  actor: string,
) {
  const parsed = legacyBridgeCommandSchema.safeParse(input);
  if (!parsed.success)
    throw new CrmValidationError(
      parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    );
  const command = parsed.data;
  requireCrmResearch(command.action === "import");
  requirePipeline(command.action === "import");
  if (command.action === "preview") {
    const result = await db.rpc("crm_legacy_page", {
      p_after: command.after,
      p_until: command.until,
      p_limit: command.limit,
    });
    crmDatabaseError(result.error);
    const data = result.data as {
      rows: LegacyLead[];
      until: string | null;
      next_after: string | null;
      total: number;
      unlinked: number;
    };
    const links = await db
      .from("crm_lead_links")
      .select("lead_id,company_id,match_state")
      .in(
        "lead_id",
        data.rows.map((r) => r.id),
      );
    crmDatabaseError(links.error);
    const linked = new Map(
      (links.data || [])
        .filter((r) => r.match_state === "confirmed")
        .map((r) => [r.lead_id, r.company_id]),
    );
    const review = new Set(
      (links.data || [])
        .filter((r) => r.match_state !== "confirmed")
        .map((r) => r.lead_id),
    );
    return {
      ...data,
      rows: data.rows.map((lead) => ({
        id: lead.id,
        updated_at: lead.updated_at,
        company: lead.company,
        already_linked: linked.has(lead.id),
        company_id: linked.get(lead.id) || null,
        disposition: !String(lead.company || "").trim()
          ? "held_missing_company"
          : linked.has(lead.id)
            ? "already_linked"
            : review.has(lead.id)
              ? "held_existing_link"
              : "import_unreviewed",
      })),
    };
  }
  const hash = createHash("sha256")
    .update(canonicalPipeline(command))
    .digest("hex");
  const prior = await db
    .from("crm_research_receipts")
    .select("payload_hash,actor,receipt")
    .eq("request_id", command.request_id)
    .maybeSingle();
  crmDatabaseError(prior.error);
  if (prior.data) {
    if (prior.data.payload_hash !== hash || prior.data.actor !== actor)
      throw new Error("crm_idempotency_conflict");
    return prior.data.receipt;
  }
  const leads = await db
    .from("lead_contacts")
    .select("*")
    .in(
      "id",
      command.rows.map((r) => r.id),
    );
  crmDatabaseError(leads.error);
  if (leads.data?.length !== command.rows.length)
    throw new Error("crm_missing_or_duplicate_lead");
  const rows = leads.data as LegacyLead[];
  for (const r of rows)
    if (r.updated_at !== command.rows.find((x) => x.id === r.id)?.updated_at)
      throw new Error("crm_lead_revision_conflict");
  const links = await db
    .from("crm_lead_links")
    .select("lead_id,company_id")
    .in(
      "lead_id",
      rows.map((r) => r.id),
    )
    .eq("match_state", "confirmed");
  crmDatabaseError(links.error);
  const linked = new Map(
    (links.data || []).map((r) => [r.lead_id, r.company_id]),
  );
  const otherLinks = await db
    .from("crm_lead_links")
    .select("lead_id")
    .in(
      "lead_id",
      rows.map((r) => r.id),
    )
    .neq("match_state", "confirmed");
  crmDatabaseError(otherLinks.error);
  const manualReview = new Set((otherLinks.data || []).map((r) => r.lead_id));
  const unlinked = rows.filter(
    (r) => !linked.has(r.id) && !manualReview.has(r.id),
  );
  const provisional = unlinked.flatMap(
    (r) =>
      legacyOperations(r, { existing: new Set(), methodIds: new Map() })
        .operations,
  );
  const existing = new Set<string>(),
    methodIds = new Map<string, string>();
  for (const [kind, table] of Object.entries(CRM_TABLES)) {
    const ids = [
      ...new Set(
        provisional.filter((o) => o.kind === kind).map((o) => o.record.id),
      ),
    ];
    if (!ids.length) continue;
    const found = await db.from(table).select("id").in("id", ids);
    crmDatabaseError(found.error);
    for (const row of found.data || []) existing.add(kind + ":" + row.id);
  }
  const values = provisional
    .filter((o) => o.kind === "method")
    .map((o) => (o.record as { normalized_value: string }).normalized_value);
  if (values.length) {
    const methods = await db
      .from("crm_contact_methods")
      .select("id,method_type,normalized_value")
      .in("normalized_value", values);
    crmDatabaseError(methods.error);
    for (const m of methods.data || [])
      methodIds.set(m.method_type + ":" + m.normalized_value, m.id);
  }
  // Candidate IDs include the canonical method ID, which may predate this bridge.
  const candidateIds = unlinked
    .flatMap(
      (r) =>
        legacyOperations(r, {
          existing: new Set(),
          methodIds: new Map(methodIds),
        }).operations,
    )
    .filter((o) => o.kind === "candidate")
    .map((o) => o.record.id);
  if (candidateIds.length) {
    const found = await db
      .from("crm_contact_candidates")
      .select("id")
      .in("id", candidateIds);
    crmDatabaseError(found.error);
    for (const r of found.data || []) existing.add("candidate:" + r.id);
  }
  const packets = [],
    snapshots = [];
  for (const lead of rows) {
    if (manualReview.has(lead.id) && !linked.has(lead.id)) {
      snapshots.push({
        lead_id: lead.id,
        company_id: null,
        snapshot: lead,
        warnings: ["existing_link_requires_review"],
      });
      continue;
    }
    if (linked.has(lead.id)) {
      snapshots.push({
        lead_id: lead.id,
        company_id: linked.get(lead.id),
        snapshot: lead,
        warnings: ["already_linked"],
      });
      continue;
    }
    const { companyId, operations, warnings } = legacyOperations(lead, {
      existing,
      methodIds,
    });
    if (operations.length) {
      const packet = {
        schema_version: "crm.research.v1",
        request_id: legacyId("packet", [command.request_id, lead.id]),
        source: "Legacy CRM bridge",
        operations,
      };
      packets.push({
        command: packet,
        hash: createHash("sha256")
          .update(canonicalPipeline(packet))
          .digest("hex"),
      });
    }
    snapshots.push({
      lead_id: lead.id,
      company_id: operations.length ? companyId : null,
      snapshot: lead,
      warnings,
    });
  }
  const applied = await db.rpc("crm_legacy_apply", {
    p_request_id: command.request_id,
    p_hash: hash,
    p_actor: actor,
    p_packets: packets,
    p_rows: snapshots,
  });
  crmDatabaseError(applied.error);
  return applied.data;
}
