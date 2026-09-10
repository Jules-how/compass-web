import type { SupabaseClient } from "@supabase/supabase-js";
import { instantlyFetch, resolveInstantlyApiKey } from "./instantly";
import { instantlyGetCampaign } from "./instantly-write";
import {
  canonical,
  digest,
  text,
  emailKey,
  companyKey,
  domainKey,
  contextErrors,
  recipeErrors,
  equivalentTimezone,
  prepareBundle,
  transportCsv,
  reconcileRecipients,
  instantlyExpected,
  MAX_BATCH,
  type Candidate,
  type Context,
  type Bundle,
  type Rendered,
  type LedgerRow,
  type PlatformLead,
  type Recipe,
  type Settings,
} from "./outbound-preparation";

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
function requireData<T>(result: {
  data: T | null;
  error: { message: string } | null;
}): asserts result is { data: T; error: null } {
  check(result.error);
  if (result.data === null) throw new Error("record_not_found");
}
export async function preparationContext(
  db: SupabaseClient,
  campaignId: string,
): Promise<Context> {
  const camp = await db
    .from("compass_pipeline_campaigns")
    .select("id,offer_key,status,vertical_tags,location_tags,sequence_draft")
    .eq("id", campaignId)
    .single();
  requireData(camp);
  if (["cancelled", "completed", "archived"].includes(camp.data.status))
    throw new Error("campaign_not_preparable");
  const [offer, config] = await Promise.all([
    db
      .from("compass_outbound_offers")
      .select("offer_key,lock,gtm_status,archived")
      .eq("offer_key", camp.data.offer_key)
      .single(),
    db
      .from("compass_outbound_configs")
      .select("recipe,settings")
      .eq("campaign_id", campaignId)
      .maybeSingle(),
  ]);
  requireData(offer);
  check(config.error);
  if (!config.data) throw new Error("preparation_configuration_required");
  if (
    camp.data.vertical_tags?.length !== 1 ||
    camp.data.location_tags?.length !== 1
  )
    throw new Error("one_vertical_and_city_required");
  return {
    campaign_id: campaignId,
    offer: offer.data,
    vertical: camp.data.vertical_tags[0],
    city: camp.data.location_tags[0],
    sequence: camp.data.sequence_draft,
    recipe: config.data.recipe,
    settings: config.data.settings,
  };
}
export async function savePreparationConfig(
  db: SupabaseClient,
  campaignId: string,
  recipe: Recipe,
  settings: Settings,
  revision: number,
) {
  if (
    !recipe ||
    !settings ||
    typeof recipe.subject !== "string" ||
    typeof recipe.opener !== "string" ||
    !Array.isArray(settings.email_list) ||
    settings.email_list.some((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))
  )
    throw new Error("invalid_configuration");
  if (recipe.opener.length > 500 || recipe.subject.length > 200)
    throw new Error("template_too_long");
  const recipeIssues = recipeErrors(recipe);
  if (recipeIssues.length) throw new Error(recipeIssues.join("; "));
  const existing = await db
    .from("compass_outbound_configs")
    .select("revision")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  check(existing.error);
  if (revision !== (existing.data?.revision ?? 0))
    throw new Error("configuration_changed_refresh_first");
  const row = {
    campaign_id: campaignId,
    recipe,
    settings,
    revision: revision + 1,
    updated_at: new Date().toISOString(),
  };
  const result = existing.data
    ? await db
        .from("compass_outbound_configs")
        .update(row)
        .eq("campaign_id", campaignId)
        .eq("revision", revision)
        .select("revision")
    : await db.from("compass_outbound_configs").insert(row).select("revision");
  check(result.error);
  if (!result.data?.length)
    throw new Error("configuration_changed_refresh_first");
}
export async function loadPreparationLedger(
  db: SupabaseClient,
  candidates: Candidate[],
): Promise<LedgerRow[]> {
  const found = new Map<string, LedgerRow>();
  const cols =
    "id,email,company,company_domain,outbound_status,suppression_reason,recontact_ok,is_archived,icp_status,pipeline_campaign_id";
  for (const [column, values] of [
    ["id", candidates.map((c) => c.lead_id).filter(Boolean)],
    ["email", candidates.map((c) => emailKey(c.email)).filter(Boolean)],
    [
      "company_domain",
      candidates.map((c) => domainKey(c.website)).filter(Boolean),
    ],
  ] as Array<[string, string[]]>) {
    const unique = [...new Set(values)];
    if (!unique.length) continue;
    const result = await db
      .from("lead_contacts")
      .select(cols)
      .in(column, unique)
      .limit(5000);
    check(result.error);
    if ((result.data ?? []).length >= 1000)
      throw new Error("overlap_query_truncated");
    for (const row of result.data ?? []) found.set(row.id, row);
  }
  return [...found.values()];
}
export async function createPreparationRun(
  db: SupabaseClient,
  campaignId: string,
  sourceRows: Record<string, unknown>[],
) {
  if (
    !Array.isArray(sourceRows) ||
    !sourceRows.length ||
    sourceRows.length > MAX_BATCH ||
    sourceRows.some(
      (row) => !row || typeof row !== "object" || Array.isArray(row),
    )
  )
    throw new Error("batch_requires_1_to_200_rows");
  const context = await preparationContext(db, campaignId);
  const errors = contextErrors(context);
  if (errors.length) throw new Error(errors.join("; "));
  const sourceHash = digest(sourceRows);
  const contextHash = digest(context);
  const id =
    "out-run-" + digest([campaignId, sourceHash, contextHash]).slice(0, 32);
  const prior = await db
    .from("compass_outbound_runs")
    .select("id,status")
    .eq("id", id)
    .maybeSingle();
  check(prior.error);
  if (prior.data?.status === "stale")
    return createPreparationRun(
      db,
      campaignId,
      sourceRows.map((row) => ({ ...row, prior_run_id: prior.data!.id })),
    );
  if (prior.data) return prior.data;
  const artifactPath = sourceHash + ".json";
  const uploaded = await db.storage
    .from("outbound-artifacts")
    .upload(artifactPath, Buffer.from(canonical(sourceRows)), {
      contentType: "application/json",
      upsert: false,
    });
  if (
    uploaded.error &&
    !/already exists|duplicate/i.test(uploaded.error.message)
  )
    throw new Error("artifact_retention_failed: " + uploaded.error.message);
  const candidates: Candidate[] = [];
  for (const [index, row] of sourceRows.entries()) {
    const company =
      text(row.company) ||
      text(row.business_name) ||
      text(row.company_name) ||
      text(row.title);
    const website = text(row.website) || text(row.website_url);
    const key = company
      ? companyKey({ company, website }, context.city)
      : "unresolved:" + sourceHash + ":" + index;
    const companyId = "out-company-" + digest(key).slice(0, 32);
    const saved = await db.from("compass_outbound_companies").upsert(
      {
        id: companyId,
        identity_key: key,
        name: company || "Unresolved source record",
        website,
      },
      { onConflict: "identity_key", ignoreDuplicates: true },
    );
    check(saved.error);
    const evidence = Array.isArray(row.evidence) ? row.evidence : [];
    if (
      evidence.length > 30 ||
      evidence.some(
        (e) =>
          !e ||
          typeof e !== "object" ||
          ["kind", "value", "quote", "url", "observed_at"].some(
            (k) => typeof (e as Record<string, unknown>)[k] !== "string",
          ),
      )
    )
      throw new Error("invalid_evidence_shape");
    candidates.push({
      id: id + ":" + index,
      company_id: companyId,
      lead_id: text(row.lead_id) || text(row.id) || null,
      company,
      website,
      email: emailKey(row.email || row.verified_email),
      evidence: evidence as Candidate["evidence"],
      geography_review: row.geography_review as Candidate["geography_review"],
      identity_reviewed: row.identity_reviewed === true,
      hold_reason: text(row.hold_reason),
      exclude_reason: text(row.exclude_reason),
      contact_basis: row.contact_basis as Candidate["contact_basis"],
      verification: row.verification as Candidate["verification"],
      draft: row.draft as Candidate["draft"],
      outreach_review: row.outreach_review as Candidate["outreach_review"],
    });
  }
  const result = await db.from("compass_outbound_runs").upsert(
    {
      id,
      campaign_id: campaignId,
      source_hash: sourceHash,
      artifact_path: artifactPath,
      source_rows: sourceRows,
      candidates,
      candidates_hash: digest(candidates),
      context,
      context_hash: contextHash,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  check(result.error);
  const saved = await db
    .from("compass_outbound_runs")
    .select("id,status")
    .eq("id", id)
    .single();
  check(saved.error);
  return saved.data;
}
export async function importCampaignInventory(
  db: SupabaseClient,
  campaignId: string,
  leadIds?: string[],
) {
  if (
    leadIds &&
    (!Array.isArray(leadIds) || !leadIds.length || leadIds.length > MAX_BATCH)
  )
    throw new Error("select_1_to_200_leads");
  let q = db
    .from("lead_contacts")
    .select("*")
    .order("id")
    .limit(MAX_BATCH + 1);
  q = leadIds ? q.in("id", leadIds) : q.eq("pipeline_campaign_id", campaignId);
  const result = await q;
  check(result.error);
  if ((result.data ?? []).length > MAX_BATCH)
    throw new Error("select_a_batch_of_at_most_200");
  if (leadIds && (result.data ?? []).length !== new Set(leadIds).size)
    throw new Error("some_selected_leads_missing");
  const rows = (result.data ?? []).map((row) => ({ ...row, lead_id: row.id }));
  return createPreparationRun(db, campaignId, rows);
}
export async function revisePreparationRun(
  db: SupabaseClient,
  campaignId: string,
  runId: string,
  candidateId: string,
  changes: Record<string, unknown>,
) {
  const run = await db
    .from("compass_outbound_runs")
    .select("campaign_id,source_rows,candidates")
    .eq("id", runId)
    .single();
  requireData(run);
  if (run.data.campaign_id !== campaignId)
    throw new Error("run_not_in_campaign");
  const index = (run.data.candidates as Candidate[]).findIndex(
    (c) => c.id === candidateId,
  );
  if (index < 0) throw new Error("candidate_not_in_run");
  const rows = (run.data.source_rows as Record<string, unknown>[]).map(
    (row, i) => ({
      ...row,
      prior_run_id: runId,
      ...(i === index ? changes : {}),
    }),
  );
  return createPreparationRun(db, campaignId, rows);
}
export async function getPreparationState(
  db: SupabaseClient,
  campaignId: string,
  runId?: string,
) {
  let runQuery = db
    .from("compass_outbound_runs")
    .select("id,status,candidates,attempts,error,created_at")
    .eq("campaign_id", campaignId);
  if (runId) runQuery = runQuery.eq("id", runId);
  const [config, runs] = await Promise.all([
    db
      .from("compass_outbound_configs")
      .select("*")
      .eq("campaign_id", campaignId)
      .maybeSingle(),
    runQuery
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  check(config.error);
  requireData(runs);
  const ids = runs.data.map((r) => r.id);
  const preps = ids.length
    ? await db
        .from("compass_outbound_preparations")
        .select("id,run_id,bundle,created_at")
        .in("run_id", ids)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [], error: null };
  requireData(preps);
  const pids = preps.data.map((p) => p.id);
  const [approvals, loads] = pids.length
    ? await Promise.all([
        db
          .from("compass_outbound_approvals")
          .select("*")
          .in("preparation_id", pids),
        db
          .from("compass_outbound_loads")
          .select("*")
          .in("preparation_id", pids),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  check(approvals.error);
  check(loads.error);
  return {
    config: config.data,
    runs: runs.data,
    preparations: preps.data,
    approvals: approvals.data,
    loads: loads.data,
  };
}
export async function claimPreparationRun(db: SupabaseClient, id: string) {
  const run = await db
    .from("compass_outbound_runs")
    .select("campaign_id,context_hash")
    .eq("id", id)
    .single();
  requireData(run);
  const ctx = await preparationContext(db, run.data.campaign_id);
  if (digest(ctx) !== run.data.context_hash) throw new Error("run_stale");
  const result = await db.rpc("outbound_claim_run", { p_id: id });
  check(result.error);
  return result.data;
}
export async function completePreparationRun(
  db: SupabaseClient,
  id: string,
  token: string,
  outputs: Rendered[],
) {
  const run = await db
    .from("compass_outbound_runs")
    .select("*")
    .eq("id", id)
    .single();
  requireData(run);
  const ctx = await preparationContext(db, run.data.campaign_id);
  if (digest(ctx) !== run.data.context_hash) throw new Error("run_stale");
  const ledger = await loadPreparationLedger(db, run.data.candidates);
  const bundle = prepareBundle(ctx, run.data.candidates, ledger, outputs);
  const pid = "out-prep-" + digest([id, bundle.hash]).slice(0, 32);
  const result = await db.rpc("outbound_complete_run", {
    p_id: id,
    p_token: token,
    p_preparation: {
      id: pid,
      hash: bundle.hash,
      input_hash: bundle.input_hash,
      context_hash: digest(ctx),
      bundle,
    },
  });
  check(result.error);
  return { id: pid, counts: bundle.counts, hash: bundle.hash };
}
export async function currentBundle(
  db: SupabaseClient,
  id: string,
): Promise<Bundle> {
  const result = await db.rpc("outbound_check_preparation", {
    p_id: id,
    p_allow_loaded: true,
  });
  check(result.error);
  const bundle = result.data as Bundle;
  const ctx = await preparationContext(db, bundle.context.campaign_id);
  if (digest(ctx) !== digest(bundle.context))
    throw new Error("preparation_stale");
  return bundle;
}
async function approvedBundle(db: SupabaseClient, id: string) {
  const bundle = await currentBundle(db, id);
  const approved = await db
    .from("compass_outbound_approvals")
    .select("hash")
    .eq("preparation_id", id)
    .maybeSingle();
  check(approved.error);
  if (approved.data?.hash !== bundle.hash)
    throw new Error("human_approval_required");
  return bundle;
}
export async function preparationExport(db: SupabaseClient, id: string) {
  const bundle = await approvedBundle(db, id);
  const load = await db
    .from("compass_outbound_loads")
    .select("preparation_id")
    .eq("preparation_id", id)
    .maybeSingle();
  check(load.error);
  if (!load.data) throw new Error("check_paused_campaign_first");
  // A reservation can outlive changes made directly in Instantly.
  await reserveBrowserLoad(db, id);
  return {
    csv: transportCsv(bundle),
    expected: instantlyExpected(bundle),
    hash: bundle.hash,
  };
}
function bodyText(value: unknown): string {
  return text(value)
    .replace(/<br\s*\/?\s*>|<\/div>|<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
function links(value: unknown): string[] {
  return [...text(value).matchAll(/href\s*=\s*["']([^"']*)["']/gi)]
    .map((m) => m[1])
    .sort();
}
export function verifyPausedCampaign(
  bundle: Bundle,
  remote: Record<string, unknown>,
): void {
  if (![0, 2].includes(remote.status as number))
    throw new Error("campaign_must_be_paused");
  const expected = instantlyExpected(bundle);
  for (const field of [
    "text_only",
    "open_tracking",
    "link_tracking",
    "stop_on_reply",
    "insert_unsubscribe_header",
    "daily_limit",
  ] as const)
    if (remote[field] !== expected[field])
      throw new Error("campaign_setting_mismatch:" + field);
  if (bundle.context.recipe.mode === "evidence_draft") {
    for (const field of ["email_gap", "random_wait_max", "match_lead_esp"] as const) {
      if (remote[field] !== expected[field]) throw new Error("campaign_setting_mismatch:"+field);
    }
  }
  if (
    canonical([...((remote.email_list as string[]) ?? [])].sort()) !==
    canonical([...expected.email_list].sort())
  )
    throw new Error("sender_pool_mismatch");
  const seq = remote.sequences as
    | Array<{ steps: (typeof expected.sequences)[0]["steps"] }>
    | undefined;
  if (
    !seq ||
    seq.length !== 1 ||
    seq[0].steps.length !== expected.sequences[0].steps.length
  )
    throw new Error("sequence_mismatch");
  expected.sequences[0].steps.forEach((step, i) => {
    const actual = seq[0].steps[i];
    if (
      actual.delay !== step.delay ||
      actual.variants?.length !== 1 ||
      text(actual.variants[0].subject) !== text(step.variants[0].subject) ||
      bodyText(actual.variants[0].body) !== bodyText(step.variants[0].body) ||
      canonical(links(actual.variants[0].body)) !==
        canonical(links(step.variants[0].body))
    )
      throw new Error("sequence_mismatch:" + i);
  });
  const schedules = (
    remote.campaign_schedule as {
      schedules?: Array<{
        timezone: string;
        timing: { from: string; to: string };
        days: Record<string, boolean>;
      }>;
    }
  )?.schedules;
  if (schedules?.length !== 1) throw new Error("one_schedule_required");
  for (const s of schedules) {
    if (
      !equivalentTimezone(s.timezone, bundle.context.settings.timezone) ||
      s.timing?.from !== bundle.context.settings.from ||
      s.timing?.to !== bundle.context.settings.to
    )
      throw new Error("schedule_mismatch");
    const names = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const active = Object.entries(s.days ?? {})
      .filter(([, enabled]) => enabled)
      .map(([key]) => (names.includes(key) ? names.indexOf(key) : Number(key)))
      .sort();
    if (canonical(active) !== canonical([1, 2, 3, 4, 5]))
      throw new Error("weekdays_schedule_required");
  }
}
export async function reserveBrowserLoad(db: SupabaseClient, id: string) {
  const bundle = await approvedBundle(db, id);
  const camp = await db
    .from("compass_pipeline_campaigns")
    .select("instantly_campaign_id")
    .eq("id", bundle.context.campaign_id)
    .single();
  requireData(camp);
  if (!camp.data.instantly_campaign_id)
    throw new Error("bind_paused_instantly_campaign_first");
  const key = await resolveInstantlyApiKey(db);
  if (!key) throw new Error("instantly_readback_not_configured");
  const remote = await instantlyGetCampaign(
    key,
    camp.data.instantly_campaign_id,
  );
  verifyPausedCampaign(bundle, remote as Record<string, unknown>);
  const reserved = await db.rpc("outbound_reserve_load", {
    p_id: id,
    p_campaign_id: camp.data.instantly_campaign_id,
  });
  check(reserved.error);
  return {
    campaign_id: camp.data.instantly_campaign_id,
    url:
      "https://app.instantly.ai/app/campaign/" +
      camp.data.instantly_campaign_id +
      "/leads",
  };
}
export async function reconcileBrowserLoad(db: SupabaseClient, id: string) {
  const bundle = await approvedBundle(db, id);
  const load = await db
    .from("compass_outbound_loads")
    .select("instantly_campaign_id")
    .eq("preparation_id", id)
    .maybeSingle();
  check(load.error);
  if (!load.data) throw new Error("check_paused_campaign_first");
  const key = await resolveInstantlyApiKey(db);
  if (!key) throw new Error("instantly_readback_not_configured");
  const remote = await instantlyGetCampaign(
    key,
    load.data.instantly_campaign_id,
  );
  verifyPausedCampaign(bundle, remote as Record<string, unknown>);
  const rows: PlatformLead[] = [];
  let cursor: string | undefined;
  const cursors = new Set<string>();
  for (let page = 0; page < 100; page++) {
    const res = await instantlyFetch<{
      items: PlatformLead[];
      next_starting_after?: string;
    }>("/leads/list", key, {
      method: "POST",
      body: JSON.stringify({
        campaign: load.data.instantly_campaign_id,
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      }),
    });
    if (!Array.isArray(res.items)) throw new Error("invalid_lead_readback");
    rows.push(...res.items);
    cursor = res.next_starting_after;
    if (!cursor) break;
    if (cursors.has(cursor) || page === 99)
      throw new Error("incomplete_lead_readback");
    cursors.add(cursor);
  }
  const after = await instantlyGetCampaign(
    key,
    load.data.instantly_campaign_id,
  );
  verifyPausedCampaign(bundle, after as Record<string, unknown>);
  const result = {
    ...reconcileRecipients(bundle, rows),
    observed_at: new Date().toISOString(),
    campaign: after,
    source: "instantly_api_readback",
  };
  const written = await db.rpc("outbound_record_receipt", {
    p_id: id,
    p_hash: digest(result),
    p_receipt: result,
  });
  check(written.error);
  return result;
}
export async function heartbeatRun(
  db: SupabaseClient,
  id: string,
  token: string,
  error?: string,
) {
  const stamp = new Date().toISOString();
  const result = await db
    .from("compass_outbound_runs")
    .update(
      error
        ? {
            status: "failed",
            error: error.slice(0, 1000),
            lease_until: null,
            updated_at: stamp,
          }
        : {
            lease_until: new Date(Date.now() + 300000).toISOString(),
            updated_at: stamp,
          },
    )
    .eq("id", id)
    .eq("status", "running")
    .eq("lease_token", token)
    .gt("lease_until", stamp)
    .select("id");
  check(result.error);
  if (!(result.data ?? []).length) throw new Error("stale_attempt");
}
