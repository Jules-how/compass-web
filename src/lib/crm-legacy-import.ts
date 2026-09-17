import { createHash } from "node:crypto";
import {
  parseCrmCommand,
  normalizeCrmMethod,
  type CrmOperation,
} from "./crm-research-schema";

export type LegacyLead = Record<string, unknown> & {
  id: string;
  updated_at: string | null;
};
export const legacyId = (kind: string, value: unknown) =>
  `legacy-${kind}-${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32)}`;
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
export function legacyWebsite(value: unknown) {
  try {
    const url = new URL(text(value));
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
/** Exact historical name + full URL + city + state only. Missing parts stay separate.
 * This is an unreviewed source identity, never current qualification or legal identity. */
export function legacyCompanyId(lead: LegacyLead) {
  const name = text(lead.company),
    site = legacyWebsite(lead.website),
    city = text(lead.city),
    state = text(lead.state);
  return legacyId(
    "company",
    name && site && city && state
      ? [name, site, city, state]
      : ["lead", lead.id],
  );
}
export type LegacyImportContext = {
  existing: Set<string>;
  methodIds: Map<string, string>;
};
export function legacyOperations(
  lead: LegacyLead,
  incoming: LegacyImportContext,
): { companyId: string; operations: CrmOperation[]; warnings: string[] } {
  const context = {
    existing: new Set(incoming.existing),
    methodIds: new Map(incoming.methodIds),
  };
  const companyId = legacyCompanyId(lead),
    sourceId = legacyId("source", [lead.id, lead.updated_at]),
    warnings: string[] = [];
  const operations: Array<{
    kind: string;
    expected_revision: number;
    record: Record<string, unknown>;
  }> = [];
  const add = (kind: string, record: Record<string, unknown>) => {
    const key = kind + ":" + record.id;
    if (!context.existing.has(key)) {
      operations.push({ kind, expected_revision: 0, record });
      context.existing.add(key);
    }
  };
  const name = text(lead.company);
  if (!name)
    return { companyId, operations: [], warnings: ["missing_company_name"] };
  const website = legacyWebsite(lead.website);
  add("source", {
    id: sourceId,
    source_type: "legacy_import",
    external_id: lead.id,
    artifact_ref: `crm-legacy:${lead.id}:${lead.updated_at || "undated"}`,
    note: "Exact legacy lead snapshot retained in crm_legacy_import_rows. Historical fit, drafts and verification are not current approval.",
  });
  add("company", {
    id: companyId,
    name,
    website,
    country: /^(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)$/.test(text(lead.state))
      ? "AU"
      : "ZZ",
    domains: website ? [new URL(website).hostname] : [],
    identity_status: "unreviewed",
  });
  const locationId = legacyId("location", [
    companyId,
    text(lead.city),
    text(lead.state),
  ]);
  if (text(lead.city) || text(lead.state))
    add("location", {
      id: locationId,
      company_id: companyId,
      label: [text(lead.city), text(lead.state)].filter(Boolean).join(", "),
      kind: "service_area",
      city: text(lead.city) || null,
      state: /^(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)$/.test(text(lead.state))
        ? text(lead.state)
        : null,
      administrative_region: text(lead.state) || null,
      source_id: sourceId,
      status: "unknown",
    });
  const affiliationId = legacyId("affiliation", [companyId, lead.id]);
  const named = Boolean(text(lead.name) && text(lead.role));
  if (named) {
    const personId = legacyId("person", lead.id);
    add("person", {
      id: personId,
      name: text(lead.name),
      source_id: sourceId,
      identity_status: "unreviewed",
    });
    add("affiliation", {
      id: affiliationId,
      company_id: companyId,
      person_id: personId,
      role: text(lead.role),
      state: "unknown",
      source_id: sourceId,
      decision_maker_basis:
        "Historical lead field only; current role and personal attribution require research.",
    });
  }
  const primary: Record<string, string | null> = {
    primary_email_candidate_id: null,
    primary_phone_candidate_id: null,
  };
  for (const type of ["email", "phone", "linkedin"]) {
    const value = text(lead[type]);
    if (!value) continue;
    let normalized: string;
    try {
      normalized = normalizeCrmMethod(type, value);
      // Reuse canonical validation to avoid importing malformed routes.
      parseCrmCommand({
        schema_version: "crm.research.v1",
        request_id: "validate",
        source: "Legacy bridge",
        operations: [
          {
            kind: "method",
            expected_revision: 0,
            record: {
              id: "validate",
              method_type: type,
              value,
              normalized_value: normalized,
            },
          },
        ],
      });
    } catch {
      warnings.push(`invalid_${type}`);
      continue;
    }
    const key = type + ":" + normalized;
    const methodId = context.methodIds.get(key) || legacyId("method", key);
    if (!context.methodIds.has(key)) {
      add("method", {
        id: methodId,
        method_type: type,
        value,
        normalized_value: normalized,
      });
      context.methodIds.set(key, methodId);
    }
    const candidateId = legacyId("candidate", [
      companyId,
      methodId,
      named ? affiliationId : null,
    ]);
    add("candidate", {
      id: candidateId,
      company_id: companyId,
      method_id: methodId,
      affiliation_id: named ? affiliationId : null,
      first_origin: "legacy_unknown",
      state: "unresolved",
      purpose: "unknown",
      reason:
        "Preserved historical route; verify origin, attribution and current suitability before use.",
    });
    if (type !== "linkedin")
      primary[`primary_${type}_candidate_id`] = candidateId;
  }
  add("observation", {
    id: legacyId("note", [lead.id, lead.updated_at]),
    company_id: companyId,
    source_id: sourceId,
    fact_key: "note",
    value: JSON.stringify({
      lead_id: lead.id,
      icp_status: lead.icp_status ?? null,
      lead_facts: lead.lead_facts ?? null,
      verification_status: lead.email_verify_status ?? null,
      verification_date: lead.email_verified_at ?? null,
    }).slice(0, 4000),
    evidence_type: "legacy_import",
    review_status: "pending",
    rationale:
      "Unreviewed historical snapshot; does not establish current ICP fit or verification.",
  });
  add("lead_link", {
    id: legacyId("link", lead.id),
    lead_id: lead.id,
    company_id: companyId,
    affiliation_id: named ? affiliationId : null,
    match_state: "confirmed",
    reason:
      "Deterministic source-row mapping; company identity remains unreviewed.",
    source_id: sourceId,
    expected_lead_updated_at: lead.updated_at,
    ...primary,
  });
  try {
    const parsed = parseCrmCommand({
      schema_version: "crm.research.v1",
      request_id: "legacy-validation",
      source: "Legacy bridge",
      operations,
    });
    for (const key of context.existing) incoming.existing.add(key);
    for (const [key, value] of context.methodIds)
      incoming.methodIds.set(key, value);
    return { companyId, operations: parsed.operations, warnings };
  } catch {
    // Preserve the source snapshot and let the rest of the bounded batch proceed.
    // Never truncate an identity to force it through the canonical schema.
    return {
      companyId,
      operations: [],
      warnings: [...warnings, "legacy_record_requires_review"],
    };
  }
}
