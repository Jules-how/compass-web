import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadTypescript } from "./helpers/load-typescript.mjs";
import { fixture } from "./helpers/outbound-fixture.mjs";
const p = loadTypescript("src/lib/outbound-preparation.ts");
const csv = loadTypescript("src/lib/outbound-csv.ts");
function python(f) {
  const root = path.resolve("workers/outbound/cold-email/openers");
  const r = spawnSync(
    "python3",
    [
      "-c",
      `import sys,json;sys.path.insert(0,${JSON.stringify(root)});from generate_openers import render_preparation_ticket;print(json.dumps(render_preparation_ticket(json.load(sys.stdin))))`,
    ],
    {
      input: JSON.stringify({ context: f.context, candidates: [f.candidate] }),
      encoding: "utf8",
    },
  );
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
function setup() {
  const f = fixture();
  f.context.recipe.rules = [
    {
      id: "project",
      label: "Installation project",
      field: "installation_project",
      opener: "Saw {company} shared {signal}.",
      subject: "{service_area} installations",
    },
    {
      id: "finance",
      label: "Finance available",
      field: "finance",
      opener: "Saw {company} offers {signal}.",
    },
  ];
  f.candidate.evidence.push({
    kind: "installation_project",
    value: "ducted replacement in Ryde",
    quote: "Our ducted replacement in Ryde project",
    url: "https://example.test/projects",
    observed_at: "2026-09-01T00:00:00Z",
  });
  return f;
}
test("actual Python worker and server agree on ordered source-backed signal and full emails", () => {
  const f = setup();
  const out = python(f);
  const bundle = p.prepareBundle(f.context, [f.candidate], f.ledger, out);
  assert.equal(bundle.counts.pass, 1);
  assert.equal(out[0].values.signal_id, "project");
  assert.match(out[0].steps[0].body, /ducted replacement in Ryde/);
  assert.equal(out[0].steps[0].subject, out[0].values.subject);
});
test("a changed rule produces changed output and hash on the same source", () => {
  const f = setup();
  const first = p.prepareBundle(f.context, [f.candidate], f.ledger, python(f));
  f.context.recipe.rules[0].opener = "Noticed {company} published {signal}.";
  const next = p.prepareBundle(f.context, [f.candidate], f.ledger, python(f));
  assert.notEqual(first.hash, next.hash);
  assert.match(next.records[0].rendered.values.opener, /Noticed/);
  assert.deepEqual(first.records[0].candidate, next.records[0].candidate);
});
test("conflicting optional signal falls back without inventing a fact", () => {
  const f = setup();
  f.candidate.evidence.push({
    ...f.candidate.evidence.at(-1),
    value: "another project",
    quote: "another project",
  });
  const out = python(f);
  assert.equal(out[0].values.signal_id, "fallback");
  assert.equal(
    p.prepareBundle(f.context, [f.candidate], f.ledger, out).counts.pass,
    1,
  );
});
test("template typo holds the row with a specific explanation", () => {
  const f = setup();
  f.context.recipe.rules[0].opener = "Saw {missing_fact}.";
  const b = p.prepareBundle(f.context, [f.candidate], f.ledger, python(f));
  assert.equal(b.counts.hold, 1);
  assert.ok(
    b.records[0].reasons.includes("blank_or_unknown_variable:missing_fact"),
  );
});
test("suburb coverage needs an explicit geography review", () => {
  const f = fixture();
  const area = f.candidate.evidence.find((e) => e.kind === "service_area");
  area.value = "Ryde";
  area.quote = "Servicing Ryde";
  assert.ok(
    p
      .assessCandidate(f.candidate, f.context, f.ledger)
      .includes("sydney_service_area_unconfirmed"),
  );
  f.candidate.geography_review = {
    region: "greater_sydney",
    rationale: "Published coverage is Ryde, within Greater Sydney.",
    checked_at: "2026-09-01T00:00:00Z",
  };
  assert.ok(
    !p
      .assessCandidate(f.candidate, f.context, f.ledger)
      .includes("sydney_service_area_unconfirmed"),
  );
});
test("CSV quoted multiline data round-trips without promoting a verification label", () => {
  const rows = csv.parsePreparationCsv(
    'company,website,verified_email,notes\r\n"Example Air",https://example.test,a@example.test,"two\nlines, retained"',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].notes, "two\nlines, retained");
  assert.equal(rows[0].verification, undefined);
  assert.equal(rows[0].identity_reviewed, false);
});
test("malformed structured CSV fails before a write", () => {
  assert.throws(
    () => csv.parsePreparationCsv("company,evidence\nExample Air,nope"),
    /valid JSON/,
  );
  assert.throws(
    () => csv.parsePreparationCsv("company,email\nA,x,extra"),
    /CSV row/,
  );
  assert.throws(
    () => csv.parsePreparationCsv("company,company\nA,B"),
    /unique/,
  );
});
test("review output retains held companies and sanitizes spreadsheet formula cells", () => {
  const out = csv.reviewCsv([
    {
      candidate: { company: "=DANGER()", email: "", evidence: [] },
      status: "hold",
      reasons: ["verification_pending"],
      rendered: null,
    },
  ]);
  assert.match(out, /'=DANGER/);
  assert.match(out, /verification_pending/);
  assert.match(out, /hold/);
});
test("rules reject duplicate identities and reserved fields", () => {
  const f = setup();
  f.context.recipe.rules.push({
    ...f.context.recipe.rules[0],
    field: "company",
  });
  assert.ok(p.recipeErrors(f.context.recipe).includes("duplicate_signal_id"));
  assert.ok(
    p.recipeErrors(f.context.recipe).includes("reserved_signal_field:company"),
  );
});

test("a CSV retry can read an older run without crossing campaign boundaries", async () => {
  const server = loadTypescript("src/lib/outbound-preparation-server.ts", {
    "./instantly": {}, "./instantly-write": {}
  });
  const runs = Array.from({length: 12}, (_, i) => ({id: `run-${i}`, campaign_id: "cell"}));
  const db = {from(table) {
    let rows = table === "compass_outbound_runs" ? [...runs] : table === "compass_outbound_preparations" ? [{id: "prep-oldest", run_id: "run-11"}] : [];
    const q = {
      select() {return q;},
      eq(key, value) {rows = rows.filter(r => r[key] === value); return q;},
      in(key, values) {rows = rows.filter(r => values.includes(r[key])); return q;},
      order() {return q;},
      limit(n) {rows = rows.slice(0,n); return q;},
      maybeSingle() {return Promise.resolve({data: rows[0] ?? null, error:null});},
      then(resolve) {resolve({data:rows, error:null});}
    }; return q;
  }};
  const old = await server.getPreparationState(db, "cell", "run-11");
  assert.equal(old.preparations[0].id, "prep-oldest");
  assert.deepEqual((await server.getPreparationState(db, "different-cell", "run-11")).preparations, []);
});
