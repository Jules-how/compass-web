import { createHash } from "node:crypto";
import { compileStepBody, type OutboundSequence } from "./outbound-copy";

export const PREPARATION_SCHEMA = "outbound.preparation.v1";
export const MAX_BATCH = 200;
export const REQUIRED_EVIDENCE = [
  "service",
  "service_area",
  "residential",
  "quote_journey",
  "independent",
  "email",
] as const;
export type Evidence = {
  kind: string;
  value: string;
  quote: string;
  url: string;
  observed_at: string;
};
export type Candidate = {
  id: string;
  company_id: string;
  lead_id: string | null;
  company: string;
  website: string;
  email: string;
  evidence: Evidence[];
  identity_reviewed: boolean;
  hold_reason?: string;
  exclude_reason?: string;
  contact_basis?: {
    kind: string;
    rationale: string;
    url: string;
    checked_at: string;
  };
  geography_review?: { region: string; rationale: string; checked_at: string };
  verification?: { status: string; provider: string; checked_at: string };
  draft?: { subject: string; opener: string; signal_type: string; offer_connection: string; evidence_kinds: string[] };
  outreach_review?: { status: "uncontacted" | "contacted" | "unknown"; source: string; checked_at: string };
};
export type SignalRule = {
  id: string;
  label: string;
  field: string;
  contains?: string;
  opener: string;
  subject?: string;
};
export type Recipe = {
  mode?: "template" | "evidence_draft";
  subject: string;
  opener: string;
  rules?: SignalRule[];
  include_name?: boolean;
};
export type Settings = {
  timezone: string;
  email_list: string[];
  from: string;
  to: string;
  daily_limit: number;
  email_gap?: number;
  random_wait_max?: number;
  match_lead_esp?: boolean;
};
export type Context = {
  pipeline?: {manifest_id:string;list_id:string;workflow_version_id:string;template_version_id:string;copy_mode?:"recipient_variables"|"existing_sequence";source_sequence?:OutboundSequence};
  campaign_id: string;
  offer_revision_id: string;
  market_test_id: string | null;
  offer: Record<string, unknown>;
  vertical: string;
  city: string;
  sequence: OutboundSequence;
  recipe: Recipe;
  settings: Settings;
};
export type LedgerRow = {
  id: string;
  email: string | null;
  company: string | null;
  company_domain?: string | null;
  outbound_status?: string | null;
  suppression_reason?: string | null;
  recontact_ok?: boolean | number | null;
  is_archived?: boolean | number | null;
  icp_status?: string | null;
  pipeline_campaign_id?: string | null;
};
export type Rendered = {
  candidate_id: string;
  values: Record<string, string>;
  steps: Array<{ subject: string; body: string }>;
};
export type Assessed = {
  candidate: Candidate;
  status: "pass" | "hold" | "exclude";
  reasons: string[];
  rendered: Rendered | null;
};
export type Bundle = {
  schema_version: string;
  context: Context;
  input_hash: string;
  records: Assessed[];
  counts: { total: number; pass: number; hold: number; exclude: number };
  hash: string;
};

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            canonical((value as Record<string, unknown>)[key]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
export function emailKey(value: unknown): string {
  return text(value).toLowerCase();
}
export function validUrl(value: unknown): boolean {
  try {
    const u = new URL(text(value));
    return (
      ["https:", "http:"].includes(u.protocol) &&
      !!u.hostname &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
export function domainKey(value: unknown): string {
  try {
    const host = new URL(text(value)).hostname.toLowerCase().replace(/^www\./, "");
    return host === "tradehq.com.au" ? "" : host;
  } catch {
    return "";
  }
}
export function companyKey(
  row: { company: string; website: string },
  city: string,
): string {
  const domain = domainKey(row.website);
  return domain
    ? "domain:" + domain
    : "name:" +
        text(row.company)
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, " ") +
        ":" +
        city.toLowerCase();
}
export function validTime(value: unknown): boolean {
  const n = Date.parse(text(value));
  return Number.isFinite(n) && n <= Date.now() + 60000;
}
export function evidenceValid(e: Evidence): boolean {
  return (
    !!text(e.value) &&
    !!text(e.quote) &&
    validUrl(e.url) &&
    validTime(e.observed_at) &&
    e.quote.toLowerCase().includes(e.value.toLowerCase())
  );
}
export function evidenceValue(row: Candidate, kind: string): string {
  const facts = row.evidence.filter((e) => e.kind === kind);
  if (facts.some((e) => !evidenceValid(e))) return "";
  const values = [...new Set(facts.map((e) => text(e.value)))];
  return values.length === 1 ? values[0] : "";
}
export function ledgerBlock(
  row: LedgerRow | undefined,
  campaignId: string,
  review?: Candidate["outreach_review"],
): string[] {
  if (!row) return ["not_in_lead_ledger"];
  const reasons: string[] = [];
  if (row.is_archived) reasons.push("archived");
  if (
    row.suppression_reason ||
    row.recontact_ok === false ||
    row.recontact_ok === 0
  )
    reasons.push("suppressed");
  const reviewedUnsent = review?.status === "uncontacted" && !!text(review.source) && validTime(review.checked_at) && Date.now() - Date.parse(review.checked_at) < 24 * 3600000;
  if (row.outbound_status !== "uncontacted" && !(reviewedUnsent && ["in_instantly", "ready", "none"].includes(row.outbound_status ?? ""))) reasons.push("previous_outreach");
  if (row.icp_status === "skip") reasons.push("icp_excluded");
  if (!reviewedUnsent && row.pipeline_campaign_id && row.pipeline_campaign_id !== campaignId)
    reasons.push("different_campaign");
  return reasons;
}
export function assessCandidate(
  row: Candidate,
  context: Context,
  ledger: LedgerRow[],
): string[] {
  const reasons: string[] = [];
  if (!row.company.trim()) reasons.push("missing_company");
  if (!validUrl(row.website)) reasons.push("company_website_required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
    reasons.push("missing_or_invalid_email");
  const current = context.recipe.mode === "evidence_draft";
  if (!current && !row.identity_reviewed) reasons.push("identity_review_required");
  for (const kind of (current ? ["service", "service_area", "operating", "email"] : REQUIRED_EVIDENCE)) {
    if (!evidenceValue(row, kind))
      reasons.push("evidence_missing_or_contradictory:" + kind);
  }
  if (emailKey(evidenceValue(row, "email")) !== emailKey(row.email))
    reasons.push("email_not_published");
  if (current && (!/install|replac|\bfit[- ]out\b|\bplant upgrades?\b/i.test(evidenceValue(row, "service")) || !/air.?condition|\bair[- ]?cons?\b|\bhvac\b|\bac\b|split|reverse.cycle|ducted/i.test(evidenceValue(row, "service")))) reasons.push("ac_installation_unconfirmed");
  if (!current && !/ducted/i.test(evidenceValue(row, "service")))
    reasons.push("ducted_service_unconfirmed");
  const areaReview = row.geography_review;
  const reviewedSydney =
    areaReview?.region === "greater_sydney" &&
    !!text(areaReview.rationale) &&
    validTime(areaReview.checked_at);
  if (
    !current && !/\bsydney\b/i.test(evidenceValue(row, "service_area")) &&
    !reviewedSydney
  )
    reasons.push("sydney_service_area_unconfirmed");
  if (current) {
    const area = evidenceValue(row, "service_area").toLowerCase();
    const region = areaReview?.region?.replace(/^greater_/, "").replaceAll("_", " ").toLowerCase();
    if (!area.includes(context.city.toLowerCase()) && !(region === context.city.toLowerCase() && !!text(areaReview?.rationale) && validTime(areaReview?.checked_at))) reasons.push("service_area_unconfirmed");
    if (!row.outreach_review || row.outreach_review.status !== "uncontacted" || !text(row.outreach_review.source) || !validTime(row.outreach_review.checked_at) || Date.now()-Date.parse(row.outreach_review.checked_at)>24*3600000) reasons.push("outreach_history_check_required");
  }
  const basis = row.contact_basis;
  if (
    !basis ||
    !["express", "published_role_relevant", "existing_relationship"].includes(
      basis.kind,
    ) ||
    !text(basis.rationale) ||
    !validUrl(basis.url) ||
    !validTime(basis.checked_at)
  )
    reasons.push("contact_basis_required");
  const check = row.verification;
  if (!check || !text(check.provider) || !validTime(check.checked_at))
    reasons.push("verification_pending");
  else if (
    !["valid", "ok"].includes(
      check.status,
    )
  )
    reasons.push("verification_ineligible");
  else if (Date.now() - Date.parse(check.checked_at) > 30 * 86400000) reasons.push("verification_stale");
  const own = ledger.find(
    (l) => l.id === row.lead_id && emailKey(l.email) === emailKey(row.email),
  );
  reasons.push(...ledgerBlock(own, context.campaign_id, current ? row.outreach_review : undefined));
  const domain = domainKey(row.website);
  if (
    own &&
    (text(own.company).toLowerCase() !== row.company.toLowerCase() ||
      (own.company_domain &&
        own.company_domain.toLowerCase().replace(/^www\./, "") !== domain))
  )
    reasons.push("ledger_identity_mismatch");
  for (const other of ledger) {
    if (other.id === own?.id) continue;
    if (
      (emailKey(row.email) && emailKey(other.email) === emailKey(row.email)) ||
      (!current && domain &&
        other.company_domain?.toLowerCase().replace(/^www\./, "") === domain)
    ) {
      if (
        ledgerBlock(other, context.campaign_id).length ||
        other.id !== row.lead_id
      )
        reasons.push("company_or_inbox_overlap:" + other.id);
    }
  }
  if (row.hold_reason) reasons.push(row.hold_reason);
  return [...new Set(reasons)];
}
export function contextErrors(ctx: Context): string[] {
  const errors: string[] = [];
  if (
    ctx.offer.offer_key !== "installation-booking" ||
    ctx.offer.archived ||
    !["testing", "live"].includes(text(ctx.offer.gtm_status))
  )
    errors.push("active_installation_offer_required");
  if (ctx.vertical !== "hvac" || !text(ctx.city)) errors.push("hvac_city_required");
  if (ctx.recipe.mode !== "evidence_draft" && ctx.city.toLowerCase() !== "sydney") errors.push("current_city_recipe_required");
  const relevance = (ctx.offer.lock as { relevance?: unknown[] })?.relevance;
  if (!Array.isArray(relevance) || !relevance.length)
    errors.push("targeting_contract_required");
  const cityZones: Record<string,string> = {sydney:'Australia/Sydney',melbourne:'Australia/Melbourne',perth:'Australia/Perth',brisbane:'Australia/Brisbane',adelaide:'Australia/Adelaide',darwin:'Australia/Darwin',hobart:'Australia/Hobart',canberra:'Australia/Sydney'};
  const expectedZone=cityZones[ctx.city.toLowerCase()];
  if (expectedZone && !equivalentTimezone(ctx.settings?.timezone,expectedZone)) errors.push('city_timezone_mismatch');
  const steps = Array.isArray(ctx.sequence?.steps) ? ctx.sequence.steps : [];
  if (steps.length !== 2) errors.push("email_plus_followup_required");
  if (!text(ctx.recipe?.subject) || !text(ctx.recipe?.opener))
    errors.push("opener_recipe_required");
  errors.push(...recipeErrors(ctx.recipe));
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (
    !validAustralianTimezone(ctx.settings?.timezone) ||
    !Array.isArray(ctx.settings.email_list) ||
    !ctx.settings.email_list.length ||
    !Number.isInteger(ctx.settings.daily_limit) ||
    ctx.settings.daily_limit < 1 ||
    !time.test(ctx.settings.from) ||
    !time.test(ctx.settings.to) ||
    ctx.settings.from >= ctx.settings.to
  )
    errors.push("review_send_settings");
  for (const [index, step] of steps.entries()) {
    if (
      !step ||
      typeof step.subject !== "string" ||
      !Array.isArray(step.slots) ||
      step.slots.some(
        (s) =>
          !s || typeof s.body !== "string" || (s.required && !text(s.body)),
      )
    ) {
      errors.push("required_sequence_slot:" + index);
      continue;
    }
    const body = compileStepBody(step, { includeCompliance: true });
    if (!body.trim()) errors.push("empty_email:" + index);
    if (index === 0 && !body.trim().startsWith("{{personalization}}"))
      errors.push("personalization_first");
    if (
      !/<a\s+[^>]*href=["']\{\{unsubscribe\}\}["'][^>]*>\s*Unsubscribe\s*<\/a>/i.test(
        body,
      ) && !(ctx.recipe.mode === 'evidence_draft' && /reply\s*[“"']?no thanks/i.test(body))
    )
      errors.push("unsubscribe_required:" + index);
    if (
      index > 0 &&
      (!Number.isFinite(step.delay_days) || Number(step.delay_days) < 2)
    )
      errors.push("two_day_gap_required");
  }
  const provider = ctx.sequence?.provider_sequences;
  if (provider !== undefined) {
    if (!Array.isArray(provider) || provider.length !== 1 || !Array.isArray(provider[0]?.steps) || provider[0].steps.length !== steps.length) errors.push("provider_sequence_invalid");
    else provider[0].steps.forEach((step, i) => {
      const native = steps[i];
      const plain = (body: string) => body.replace(/<br\s*\/?\s*>|<\/div>|<\/p>/gi, " ").replace(/<[^>]*>/g, "").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
      if (step.type !== 'email' || step.delay !== (i === steps.length - 1 ? 0 : steps[i+1].delay_days) || !Array.isArray(step.variants) || !step.variants.length || step.variants.length > 2) { errors.push('provider_sequence_invalid:' + i); return; }
      const nativeBody = compileStepBody(native, {includeCompliance:true});
      if (typeof step.variants[0]?.body !== 'string' || step.variants[0].subject !== native.subject || plain(step.variants[0].body) !== plain(nativeBody)) errors.push('provider_primary_mismatch:' + i);
      for (const variant of step.variants) {
        if (typeof variant.subject !== 'string' || typeof variant.body !== 'string' || !variant.body.trim()) { errors.push('provider_variant_invalid:' + i); continue; }
        if (variant.subject !== native.subject || (i === 0 && !plain(variant.body).startsWith('{{personalization}}'))) errors.push('provider_variant_merge_mismatch:' + i);
        const tokens = [...variant.body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m=>m[1]);
        const allowed = new Set([...nativeBody.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m=>m[1]));
        if (tokens.some(t=>!allowed.has(t)) || /[{}]/.test(variant.body.replace(/\{\{\s*\w+\s*\}\}/g,''))) errors.push('provider_variant_unknown_merge:' + i);
        if (!/reply\s*[“"']?no thanks/i.test(variant.body) && !variant.body.includes('{{unsubscribe}}')) errors.push('provider_variant_unsubscribe_required:' + i);
      }
    });
  }
  return errors;
}
// Independent boundary validation of the worker's deterministic substitutions.
// The UI displays persisted worker output; it never generates another opener.
export function substitute(
  body: string,
  values: Record<string, string>,
  double = true,
): string {
  const pattern = double ? /\{\{\s*(\w+)\s*\}\}/g : /\{(\w+)\}/g;
  const result = body.replace(pattern, (_token, key: string) => {
    if (
      !Object.prototype.hasOwnProperty.call(values, key) ||
      !values[key]?.trim()
    )
      throw new Error("blank_or_unknown_variable:" + key);
    return values[key];
  });
  if (/[{}]/.test(result)) throw new Error("unsupported_template_syntax");
  if (/\b(?:Hi|Hey|Hello)\s*[,!]/i.test(result))
    throw new Error("blank_greeting");
  return result;
}
export function recipeErrors(recipe: Recipe): string[] {
  const errors: string[] = [];
  const rules = recipe?.rules ?? [];
  if (!Array.isArray(rules) || rules.length > 12)
    return ["invalid_signal_rules"];
  if (new Set(rules.map((r) => r.id)).size !== rules.length)
    errors.push("duplicate_signal_id");
  for (const r of rules) {
    if (
      !/^[a-z][a-z0-9_]{0,49}$/.test(r.id) ||
      !/^[a-z][a-z0-9_]{0,49}$/.test(r.field) ||
      !text(r.label) ||
      !text(r.opener)
    )
      errors.push("invalid_signal_rule");
    if (
      [
        "company",
        "email",
        "person_name",
        "signal",
        "signal_id",
        "signal_label",
      ].includes(r.field)
    )
      errors.push("reserved_signal_field:" + r.field);
  }
  for (const template of [
    recipe?.opener,
    recipe?.subject,
    ...rules.flatMap((r) => [r.opener, r.subject ?? ""]),
  ]) {
    if (typeof template !== "string" || template.length > 500)
      errors.push("invalid_template");
    else if (/[{}]/.test(template.replace(/\{[a-z][a-z0-9_]*\}/g, "")))
      errors.push("unsupported_template_syntax");
  }
  return [...new Set(errors)];
}
export function chooseSignal(candidate: Candidate, recipe: Recipe) {
  return (recipe.rules ?? []).find((r) => {
    const value = evidenceValue(candidate, r.field);
    return (
      !!value &&
      (!r.contains?.trim() ||
        value.toLowerCase().includes(r.contains.trim().toLowerCase()))
    );
  });
}
export function expectedValues(
  candidate: Candidate,
  recipe: Recipe,
  city = "Sydney",
): Record<string, string> {
  const errors = recipeErrors(recipe);
  if (errors.length) throw new Error(errors.join("; "));
  if (recipe.mode === "evidence_draft") {
    const d = candidate.draft;
    if (!d || !text(d.subject) || !text(d.opener) || d.subject.length > 100 || d.opener.length > 500 || /[{}]/.test(d.subject+d.opener) || /^(re:|fwd:)/i.test(d.subject)) throw new Error("invalid_evidence_draft");
    if (!text(d.signal_type) || !text(d.offer_connection) || !Array.isArray(d.evidence_kinds) || !d.evidence_kinds.includes("service") || d.evidence_kinds.some(k => !evidenceValue(candidate,k))) throw new Error("draft_evidence_required");
    return {email: emailKey(candidate.email), first_name: "", company_name: candidate.company,
      subject: d.subject, opener: d.opener, personalization: d.opener};
  }
  const facts: Record<string, string> = Object.create(null);
  for (const e of candidate.evidence)
    if (/^[a-z][a-z0-9_]*$/.test(e.kind))
      facts[e.kind] = evidenceValue(candidate, e.kind);
  Object.assign(facts, {
    company: candidate.company,
    service: evidenceValue(candidate, "service"),
    service_area: evidenceValue(candidate, "service_area"),
  });
  const rule = chooseSignal(candidate, recipe);
  facts.signal = rule ? evidenceValue(candidate, rule.field) : "";
  const firstName =
    recipe.include_name === false
      ? ""
      : evidenceValue(candidate, "person_name").split(/\s+/)[0] || "";
  let opener = substitute(rule?.opener ?? recipe.opener, facts, false);
  if (firstName)
    opener =
      "Hi " +
      firstName +
      ", " +
      opener.charAt(0).toLowerCase() +
      opener.slice(1);
  const values: Record<string, string> = {
    email: emailKey(candidate.email),
    first_name: firstName,
    firstName,
    company_name: candidate.company,
    companyName: candidate.company,
    companyShort: candidate.company,
    service: facts.service,
    suburb: facts.service_area,
    city: "Sydney",
    subject: substitute(
      rule?.subject?.trim() || recipe.subject,
      facts,
      false,
    ).toLowerCase(),
    opener,
    Opener: opener,
    personalization: opener,
  };
  // Legacy batches keep their exact shape and hashes. Configured signal batches carry their selection.
  if (recipe.rules)
    Object.assign(values, {
      signal_id: rule?.id ?? "fallback",
      signal_label: rule?.label ?? "Factual fallback",
      signal_value: facts.signal,
    });
  return values;
}
export function validateWorkerRender(
  candidate: Candidate,
  ctx: Context,
  rendered: Rendered,
): void {
  const expected = expectedValues(candidate, ctx.recipe, ctx.city);
  if (
    canonical(rendered.values) !== canonical(expected) ||
    rendered.candidate_id !== candidate.id
  )
    throw new Error("worker_values_mismatch");
  const values = { ...expected, unsubscribe: "[Unsubscribe]" };
  const steps = ctx.sequence.steps.map((step, i) => ({
    subject: substitute(step.subject, values),
    body: substitute(
      compileStepBody(step, { includeCompliance: true }),
      values,
    ),
  }));
  if (canonical(steps) !== canonical(rendered.steps))
    throw new Error("worker_render_mismatch");
}
export function prepareBundle(
  context: Context,
  candidates: Candidate[],
  ledger: LedgerRow[],
  outputs: Rendered[],
): Bundle {
  const errs = contextErrors(context);
  if (errs.length) throw new Error(errs.join("; "));
  if (
    !candidates.length ||
    candidates.length > MAX_BATCH ||
    new Set(candidates.map((c) => c.id)).size !== candidates.length
  )
    throw new Error("invalid_candidate_set");
  const seenCompany = new Set<string>();
  const seenEmail = new Set<string>();
  if (
    !Array.isArray(outputs) ||
    outputs.some((o) => !o || typeof o.candidate_id !== "string") ||
    new Set(outputs.map((o) => o.candidate_id)).size !== outputs.length ||
    outputs.some((o) => !candidates.some((c) => c.id === o.candidate_id))
  )
    throw new Error("invalid_render_set");
  const records: Assessed[] = candidates.map((candidate) => {
    if (candidate.exclude_reason)
      return {
        candidate,
        status: "exclude",
        reasons: [candidate.exclude_reason],
        rendered: null,
      };
    const reasons = assessCandidate(candidate, context, ledger);
    const output = outputs.find((o) => o.candidate_id === candidate.id);
    if (
      (context.recipe.mode !== "evidence_draft" && seenCompany.has(candidate.company_id)) ||
      seenEmail.has(emailKey(candidate.email))
    )
      reasons.push("duplicate_company_or_inbox");
    if (!reasons.length) {
      if (!output) {
        try {
          expectedValues(candidate, context.recipe, context.city);
          reasons.push("render_missing");
        } catch (err) {
          reasons.push(err instanceof Error ? err.message : "render_invalid");
        }
      } else
        try {
          validateWorkerRender(candidate, context, output);
        } catch (err) {
          reasons.push(err instanceof Error ? err.message : "render_invalid");
        }
    }
    if (reasons.length)
      return { candidate, status: "hold", reasons, rendered: null };
    seenCompany.add(candidate.company_id);
    seenEmail.add(emailKey(candidate.email));
    return { candidate, status: "pass", reasons: [], rendered: output! };
  });
  const base = {
    schema_version: PREPARATION_SCHEMA,
    context,
    input_hash: digest(candidates),
    records,
    counts: {
      total: records.length,
      pass: records.filter((r) => r.status === "pass").length,
      hold: records.filter((r) => r.status === "hold").length,
      exclude: records.filter((r) => r.status === "exclude").length,
    },
  };
  return { ...base, hash: digest(base) };
}
export function transportCsv(bundle: Bundle): string {
  const rows = bundle.records
    .filter((r) => r.status === "pass")
    .map((r) => r.rendered!.values);
  if (!rows.length) throw new Error("no_eligible_recipients");
  const keys = Object.keys(rows[0]);
  const cell = (s: string) => '"' + s.replaceAll('"', '""') + '"';
  return (
    [
      keys.map(cell).join(","),
      ...rows.map((row) => keys.map((k) => cell(row[k])).join(",")),
    ].join("\r\n") + "\r\n"
  );
}
export function instantlyExpected(bundle: Bundle) {
  return {
    sequences: bundle.context.sequence.provider_sequences ?? [
      {
        steps: bundle.context.sequence.steps.map((step, i) => ({
          type: "email",
          delay:
            i === bundle.context.sequence.steps.length - 1
              ? 0
              : Math.max(2, bundle.context.sequence.steps[i + 1].delay_days ?? 2),
          variants: [
            {
              subject: step.subject,
              body: compileStepBody(step, { includeCompliance: true }),
            },
          ],
        })),
      },
    ],
    text_only: true,
    open_tracking: false,
    link_tracking: false,
    stop_on_reply: true,
    insert_unsubscribe_header: true,
    daily_limit: bundle.context.settings.daily_limit,
    email_list: bundle.context.settings.email_list,
    ...((bundle.context.recipe.mode === "evidence_draft" || bundle.context.pipeline) ? {
      email_gap: bundle.context.settings.email_gap ?? 8,
      random_wait_max: bundle.context.settings.random_wait_max ?? 5,
      match_lead_esp: bundle.context.settings.match_lead_esp ?? true,
    } : {}),
  };
}
export type PlatformLead = {
  id: string;
  email: string;
  first_name?: string;
  company_name?: string;
  personalization?: string;
  custom_variables?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};
export function reconcileRecipients(bundle: Bundle, actual: PlatformLead[]) {
  const expected = bundle.records.filter((r) => r.status === "pass");
  const receipts = expected.map((record) => {
    const email = emailKey(record.candidate.email);
    const matches = actual.filter((l) => emailKey(l.email) === email);
    if (matches.length !== 1 || !matches[0].id)
      return {
        candidate_id: record.candidate.id,
        lead_id: record.candidate.lead_id,
        email,
        status: matches.length ? "conflict" : "missing",
        provider_id: null,
      };
    const found = matches[0];
    const custom = {
      ...(found.payload ?? {}),
      ...(found.custom_variables ?? {}),
    };
    const values = record.rendered!.values;
    const mismatches = Object.entries(values).filter(([key, value]) => {
      const observed =
        key === "email"
          ? email
          : key === "first_name"
            ? text(found.first_name)
            : key === "firstName"
              ? Object.hasOwn(custom, key)
                ? text(custom[key])
                : text(found.first_name)
              : key === "company_name"
                ? text(found.company_name)
                : key === "companyName"
                  ? Object.hasOwn(custom, key)
                    ? text(custom[key])
                    : text(found.company_name)
                  : key === "personalization"
                    ? text(found.personalization) ||
                      text(custom.personalization)
                    : text(custom[key]);
      return observed !== value;
    });
    return {
      candidate_id: record.candidate.id,
      lead_id: record.candidate.lead_id,
      email,
      status: mismatches.length ? "variables_mismatch" : "confirmed",
      provider_id: found.id,
    };
  });
  const extras = actual
    .filter(
      (l) =>
        !expected.some(
          (r) => emailKey(r.candidate.email) === emailKey(l.email),
        ),
    )
    .map((l) => emailKey(l.email));
  return {
    receipts,
    extras,
    complete:
      extras.length === 0 &&
      receipts.length > 0 &&
      receipts.every((r) => r.status === "confirmed"),
  };
}

export function validAustralianTimezone(value: unknown): boolean {
  if (typeof value !== "string" || !value.startsWith("Australia/")) return false;
  try { new Intl.DateTimeFormat("en", {timeZone:value}).format(); return true; } catch { return false; }
}
export function equivalentTimezone(a: string, b: string): boolean {
  if (a === b) return true;
  if (!validAustralianTimezone(a) || !validAustralianTimezone(b)) return false;
  // Check a full forthcoming year; current-offset equality alone misses DST.
  for (let day=0; day<=366; day+=7) {
    const date=new Date(Date.now()+day*86400000);
    const opts: Intl.DateTimeFormatOptions={year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"};
    if (new Intl.DateTimeFormat("en-AU",{...opts,timeZone:a}).format(date)!==new Intl.DateTimeFormat("en-AU",{...opts,timeZone:b}).format(date)) return false;
  }
  return true;
}
