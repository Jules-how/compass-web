/** Synthetic CI/staging benchmark; never connects to the live ledger. */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";
const size = Number(process.env.PIPELINE_BENCHMARK_COMPANIES || 100000);
if (!process.env.CI && size > 1000)
  throw new Error("Run large fixtures in CI/staging, not the 8GB operator Mac");
if (!Number.isInteger(size) || size < 100 || size > 200000)
  throw new Error("Invalid fixture size");
const db = new PGlite(),
  metrics = {
    environment: {
      node: process.version,
      platform: process.platform,
      cpu: os.cpus()[0]?.model,
      memory_bytes: os.totalmem(),
    },
    companies: size,
    contacts: size * 3,
    evidence: size * 5,
    measurements: [],
  };
const measure = async (name, sql, args = []) => {
  const start = performance.now();
  const result = await db.query(sql, args);
  metrics.measurements.push({
    name,
    ms: Math.round((performance.now() - start) * 100) / 100,
    returned: result.rows.length,
  });
  return result;
};
try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE FUNCTION portal_is_operator() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
 CREATE TABLE lead_contacts(id text PRIMARY KEY,email text,phone text,company text,updated_at timestamptz,outbound_status text,suppression_reason text);
 CREATE TABLE compass_offer_revisions(id text PRIMARY KEY);
 CREATE TABLE compass_outbound_companies(id text PRIMARY KEY);CREATE TABLE compass_lead_list_members(lead_id text,list_id text);
 CREATE TABLE compass_lead_lists(id text PRIMARY KEY,name text NOT NULL,notes text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
  for (const f of [
    "20260915090000_crm_research.sql",
    "20260917090000_outbound_pipeline.sql",
    "20260917100000_outbound_pipeline_jobs.sql",
  ])
    await db.exec(fs.readFileSync("supabase/migrations/" + f, "utf8"));
  await db.exec(`INSERT INTO compass_offer_revisions VALUES('offer');
 INSERT INTO outbound_pipeline_workflows(id,name,policy,actor) VALUES('w','Fixture','{"offer_version_id":"offer","icp_version_id":"icp","criteria":[],"signals":[],"target_roles":[]}','fixture');
 INSERT INTO compass_lead_lists(id,name,workflow_version_id,offer_version_id,icp_version_id) VALUES('l','Fixture','w','offer','icp');
 INSERT INTO crm_research_sources(id,source_type,url,actor) VALUES('source','official_site','https://example.test','fixture');`);
  // Populate in bounded transactions; representative fan-out includes locations,
  // contact methods/candidates, evidence and current assessments/stage results.
  for (let start = 1; start <= size; start += 1000) {
    const end = Math.min(start + 999, size);
    await db.exec(`
 BEGIN;
 INSERT INTO crm_companies(id,name,country,website,actor) SELECT 'c-'||lpad(n::text,6,'0'),'Fixture company '||n,CASE WHEN n%2=0 THEN 'AU' ELSE 'US' END,'https://company-'||n||'.test','fixture' FROM generate_series(${start},${end})n;
 INSERT INTO outbound_pipeline_memberships(id,list_id,company_id,origin,actor) SELECT 'm-'||n,'l','c-'||lpad(n::text,6,'0'),'fixture','fixture' FROM generate_series(${start},${end})n;
 INSERT INTO crm_company_locations(id,company_id,label,kind,city,country_code,source_id,actor) SELECT 'loc-'||n,'c-'||lpad(n::text,6,'0'),'Fixture','premises',CASE WHEN n%2=0 THEN 'Sydney' ELSE 'Austin' END,CASE WHEN n%2=0 THEN 'AU' ELSE 'US' END,'source','fixture' FROM generate_series(${start},${end})n;
 INSERT INTO crm_contact_methods(id,method_type,value,normalized_value,actor) SELECT 'method-'||n||'-'||k,'email','person-'||k||'@company-'||n||'.test','person-'||k||'@company-'||n||'.test','fixture' FROM generate_series(${start},${end})n CROSS JOIN generate_series(1,3)k;
 INSERT INTO crm_contact_candidates(id,company_id,method_id,purpose,first_origin,state,actor) SELECT 'ca-'||n||'-'||k,'c-'||lpad(n::text,6,'0'),'method-'||n||'-'||k,'general','legacy_unknown','unresolved','fixture' FROM generate_series(${start},${end})n CROSS JOIN generate_series(1,3)k;
 INSERT INTO crm_research_observations(id,company_id,fact_key,value,source_id,quote,observed_at,evidence_type,review_status,actor) SELECT 'e-'||n||'-'||k,'c-'||lpad(n::text,6,'0'),'note','"Synthetic evidence"','source','Synthetic evidence',now(),'published','reviewed','fixture' FROM generate_series(${start},${end})n CROSS JOIN generate_series(1,5)k;
 INSERT INTO outbound_pipeline_assessments(id,company_id,workflow_version_id,input_revision,criteria,fit,reason,actor) SELECT 'a-'||n,'c-'||lpad(n::text,6,'0'),'w',outbound_pipeline_input_revision('c-'||lpad(n::text,6,'0')),'[]',CASE WHEN n%3=0 THEN 'likely_fit' ELSE 'unknown' END,'Fixture','fixture' FROM generate_series(${start},${end})n;
 INSERT INTO outbound_pipeline_stages(id,list_id,company_id,workflow_version_id,stage,status,reason,input_hash,output_refs,actor) SELECT 's-'||n,'l','c-'||lpad(n::text,6,'0'),'w','research','completed','Fixture','fixture','[]','fixture' FROM generate_series(${start},${end})n;
 COMMIT;`);
  }
  await db.exec("ANALYZE");
  for (let i = 0; i < 21; i++) {
    const filter = JSON.stringify({
      list_id: "l",
      country: "AU",
      city: "Sydney",
      fit: "likely_fit",
      stage: "research",
    });
    const page = await measure(
      "warm_filtered_page",
      "SELECT * FROM outbound_pipeline_companies($1) WHERE id>$2 ORDER BY id LIMIT 51",
      [filter, "c-" + String(Math.floor(size / 2)).padStart(6, "0")],
    );
    if (page.rows.length !== 51)
      throw new Error("Benchmark fixture/page unexpectedly empty");
    await measure(
      "filtered_count",
      "SELECT count(*) FROM outbound_pipeline_companies($1)",
      [filter],
    );
  }
  const pages = metrics.measurements
      .filter((m) => m.name === "warm_filtered_page")
      .slice(1),
    counts = metrics.measurements
      .filter((m) => m.name === "filtered_count")
      .slice(1);
  const samples = pages
    .map((m, i) => m.ms + counts[i].ms)
    .sort((a, b) => a - b);
  metrics.warm_page_p95_ms = samples[Math.ceil(samples.length * 0.95) - 1];
  metrics.measurement_scope =
    "Warm filtered page plus exact count, matching API request";
  metrics.target_p95_ms = 1000;
  metrics.target_met = metrics.warm_page_p95_ms < 1000;
  const filter = {
    schema_version: "outbound.pipeline.v1",
    request_id: "benchmark-export",
    source: "Synthetic benchmark",
    action: "create_export",
    job_id: "export",
    expected_revision: 0,
    data: { list_id: "l", grain: "companies", columns: ["id", "name", "fit"] },
  };
  await measure(
    "freeze_100k_export_scope",
    "SELECT outbound_pipeline_job_create($1,$2,$3)",
    [filter, JSON.stringify(filter), "agent"],
  );
  const job = (
    await db.query(
      "SELECT total_count FROM outbound_pipeline_jobs WHERE id='export'",
    )
  ).rows[0];
  if (job.total_count !== size)
    throw new Error("Frozen export scope lost records");
  const first = await db.query(
    "SELECT id FROM outbound_pipeline_job_items WHERE job_id='export' ORDER BY id LIMIT 100",
  );
  const second = await db.query(
    "SELECT id FROM outbound_pipeline_job_items WHERE job_id='export' AND id>$1 ORDER BY id LIMIT 100",
    [first.rows.at(-1).id],
  );
  if (new Set([...first.rows, ...second.rows].map((r) => r.id)).size !== 200)
    throw new Error("Page replay overlaps");
  metrics.frozen_export_count = job.total_count;
} finally {
  await db.close();
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync(
    "artifacts/outbound-scale.json",
    JSON.stringify(metrics, null, 2),
  );
  console.log(
    JSON.stringify({
      companies: size,
      p95_ms: metrics.warm_page_p95_ms,
      target_met: metrics.target_met,
      artifact: "artifacts/outbound-scale.json",
    }),
  );
}
if (!metrics.target_met) process.exitCode = 1;
