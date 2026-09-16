import cohort from "./example-cohort.json";
export type Evidence = {
  label: string;
  quote: string;
  url: string;
  checkedAt: string;
};
export type Revision = {
  version: number;
  subject: string;
  body: string;
  opener: string;
  approved: boolean;
  time: string;
};
export type Company = {
  id: number;
  name: string;
  domain: string;
  website: string;
  city: string;
  email: string;
  contactSource: string;
  contactPublished: boolean;
  verification: string;
  verifiedAt: string;
  verificationProvider: string;
  priorOutreach: string[];
  evidence: Evidence[];
  opener: string;
  signal: string;
  researchIssue: string;
  fetchError: string | null;
  subject: string;
  body: string;
  version: number;
  approved: number | null;
  revisions: Revision[];
  held: boolean;
  note: string;
};
export type Config = {
  name: string;
  companyIds?: number[];
  offer: string;
  icp: string;
  geography: string;
  size: number;
  source: string;
  research: string;
  model: string;
  budget: number;
  checkpoint: boolean;
};
export type Batch = {
  id: string;
  config: Config;
  rows: Company[];
  phase: "define" | "research" | "review";
  history: { id: string; time: string; title: string; detail: string }[];
};
export const defaults: Config = {
  name: "Sydney · air conditioning",
  offer: "Installation enquiries and quote booking",
  icp: "Established residential air conditioning installers. Prioritise ducted installation work.",
  geography: "Sydney",
  size: 10,
  source: "Saved company register",
  research: "Saved website evidence",
  model: "Saved copy + local checks",
  budget: 5,
  checkpoint: true,
};
export const steps = [
  ["Define batch", "Offer, criteria, geography and budget"],
  ["Source companies", "Company register → company records"],
  ["Establish identity", "Domain and saved website → identity evidence"],
  ["Research", "Saved website → dated source excerpts"],
  ["Assess fit", "Service and area evidence → partial fit assessment"],
  ["Resolve contacts", "Published contact source → sourced email"],
  ["Check eligibility", "Recorded verification → holds and unknowns"],
  ["Select evidence", "Supported company fact → writing evidence"],
  ["Draft", "Saved opener and offer body → versioned email"],
  ["Review", "Exact subject and email → human approval"],
  [
    "Load & reconcile",
    "Approved versions + provider readback → paused receipt",
  ],
  [
    "Activate & observe",
    "Reconciled campaign + explicit approval → sending state",
  ],
];
export function bodyFor(r: Company) {
  return `Hi team,\n\n${r.opener}\n\nI’m testing a service that uses Google Search to bring in suitable installation enquiries and helps turn them into booked quote appointments.\n\nWould it be useful if I sent a short outline?\n\nJules\n\nIf this isn’t relevant, let me know and I won’t follow up.`;
}
export function event(b: Batch, title: string, detail: string) {
  b.history.unshift({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    title,
    detail,
  });
}
export function createBatch(
  config: Config = defaults,
  prepared = false,
): Batch {
  const b: Batch = {
    id: crypto.randomUUID(),
    config: { ...config },
    phase: prepared ? "review" : "define",
    history: [],
    rows: cohort
      .filter((c, i) => config.companyIds ? config.companyIds.includes(c.id) : i < config.size)
      .map((c) => ({
        ...c,
        subject: "Installation enquiries",
        body: "",
        version: 1,
        approved: null,
        revisions: [],
        held: false,
        note: "",
      })),
  };
  if (prepared) {
    for (const r of b.rows)
      if (!r.researchIssue && r.opener) r.body = bodyFor(r);
    event(
      b,
      "Saved example loaded",
      "10 companies; website evidence from 16 Sep 2026 and recorded email results from 10 Sep. No fresh provider calls.",
    );
  }
  return b;
}
export function hasIssue(r: Company) {
  return Boolean(
    r.held || r.researchIssue || !r.contactPublished || r.verification !== "ok",
  );
}
export function checks(r: Company) {
  return [
    !r.subject.trim() ? "Subject is missing" : "",
    !r.body.trim() ? "Email is missing" : "",
    !r.opener || !r.body.includes(r.opener)
      ? "Email must contain the selected writing fact"
      : "",
    !r.body.includes("won’t follow up") ? "Opt-out is missing" : "",
    r.researchIssue ? "Company research is unresolved" : "",
  ].filter(Boolean);
}
export function prepare(b: Batch, continueReview = false) {
  b.phase = b.config.checkpoint && !continueReview ? "research" : "review";
  if (b.phase === "review")
    for (const r of b.rows)
      if (!r.researchIssue && r.opener && !r.body) r.body = bodyFor(r);
  event(
    b,
    "Preparation checkpoint",
    b.phase === "research"
      ? "Saved evidence ready for review. Stopped before drafting."
      : "Local assembly complete. Stopped for exact copy approval; contact holds retained.",
  );
}
export function revise(
  b: Batch,
  r: Company,
  subject: string,
  body: string,
  opener = r.opener,
) {
  r.revisions.unshift({
    version: r.version,
    subject: r.subject,
    body: r.body,
    opener: r.opener,
    approved: r.approved === r.version,
    time: new Date().toISOString(),
  });
  const changedEvidence = opener !== r.opener;
  r.subject = subject;
  r.body = changedEvidence ? "" : body;
  r.opener = opener;
  r.version++;
  r.approved = null;
  event(
    b,
    changedEvidence ? "Writing evidence corrected" : "Copy revised",
    `${r.name} · version ${r.version}. Approval invalidated${changedEvidence ? "; dependent draft cleared" : ""}.`,
  );
}
export function approve(b: Batch, r: Company) {
  if (checks(r).length) return false;
  r.approved = r.version;
  event(
    b,
    "Exact version approved",
    `${r.name} · v${r.version}. Contact eligibility unchanged.`,
  );
  return true;
}
