import { validateDocument, documentText } from "./rich-document.mjs";
export const GOAL_PERIODS = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];
export const PLANNING_KINDS = ["goal", "note", "time", "run", "preparation"];
const text = (v, max = 4000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
function date(v, required = false) {
  if (!v && !required) return "";
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw new Error("Use a valid calendar date.");
  return v;
}
function number(v, required = false) {
  if (v === "" || v == null) {
    if (required) throw new Error("Enter the actual value.");
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1000000000)
    throw new Error("Use a non-negative number.");
  return n;
}
export function validatePlanning(kind, input) {
  if (!PLANNING_KINDS.includes(kind) || !input || typeof input !== "object")
    throw new Error("Invalid record.");
  const title = text(input.title, 200);
  if (!title) throw new Error("A title is required.");
  const base = { title, archived: input.archived === true };
  if (kind === "goal") {
    const period = input.period;
    if (!GOAL_PERIODS.includes(period))
      throw new Error("Choose a goal period.");
    const qualitative = input.measurementType === "qualitative";
    const draft = input.status === "draft";
    const direction = input.direction === "decrease" ? "decrease" : "increase";
    const regular = qualitative ? null : number(input.regular, !draft),
      stretch = number(input.stretch);
    if (
      !qualitative &&
      regular != null &&
      stretch != null &&
      (direction === "decrease" ? stretch > regular : stretch < regular)
    )
      throw new Error(
        "Stretch must be more ambitious than the regular target.",
      );
    const actual = number(input.actual),
      source = text(input.source, 2000);
    if (actual != null && !source)
      throw new Error("Record where the actual result came from.");
    const start = date(input.start),
      due = date(input.due, !draft);
    if (start && due && start > due)
      throw new Error("The deadline must follow the start date.");
    if (qualitative && !draft && !text(input.criteria))
      throw new Error("Describe an observable acceptance condition.");
    return {
      ...base,
      period,
      domain: input.domain === "personal" ? "personal" : "business",
      measurementType: qualitative ? "qualitative" : "quantitative",
      measuresProfile: input.measuresProfile === "sales_validation" ? "sales_validation" : "goal",
      direction,
      criteria: text(input.criteria, 4000),
      metricDefinition: text(input.metricDefinition, 4000),
      owner: text(input.owner, 120) || "Jules",
      expectedSprints:
        input.expectedSprints === "" || input.expectedSprints == null
          ? null
          : Math.floor(number(input.expectedSprints)),
      currency: text(input.currency, 8),
      freshnessDays:
        input.freshnessDays == null
          ? 30
          : Math.max(1, Math.min(365, number(input.freshnessDays, true))),
      start,
      due,
      regular,
      stretch,
      baseline: number(input.baseline),
      actual,
      forecast: number(input.forecast),
      unit: text(input.unit, 80) || "count",
      source,
      parentId: text(input.parentId, 100),
      status: input.status === "committed" ? "committed" : "draft",
      notes: typeof input.notes === "string" ? input.notes.slice(0, 4000) : "",
      links: text(input.links, 2000),
    };
  }
  if (kind === "note") {
    const document = input.document ? validateDocument(input.document) : null;
    if (typeof input.body === "string" && input.body.length > 20000)
      throw new Error(
        "Note exceeds 20,000 characters; saved content is unchanged.",
      );
    const subject = input.subject;
    if (
      subject &&
      (!["goal", "contact"].includes(subject.kind) ||
        !/^[-a-zA-Z0-9_.:]{1,200}$/.test(subject.id || ""))
    )
      throw new Error("Invalid notebook subject.");
    return {
      ...base,
      body: document
        ? documentText(document)
        : typeof input.body === "string"
          ? input.body
          : "",
      ...(document ? { document } : {}),
      ...(subject ? { subject: { kind: subject.kind, id: subject.id } } : {}),
      date: date(input.date),
      goalId: text(input.goalId, 100),
      links: text(input.links, 2000),
      status: input.status === "decision" ? "decision" : "idea",
    };
  }
  if (kind === "time") {
    const actualMinutes = number(input.actualMinutes),
      plannedMinutes = number(input.plannedMinutes);
    if (
      (actualMinutes != null && actualMinutes > 1440) ||
      (plannedMinutes != null && plannedMinutes > 1440)
    )
      throw new Error("Minutes cannot exceed a day.");
    return {
      ...base,
      date: date(input.date, true),
      actualMinutes,
      plannedMinutes,
      goalId: text(input.goalId, 100),
      workType: text(input.workType, 60) || "Other",
      result: ["completed", "partial", "blocked"].includes(input.result)
        ? input.result
        : "partial",
      output: text(input.output, 3000),
      links: text(input.links, 2000),
    };
  }
  return {
    ...base,
    body: text(input.body, 30000),
    status: ["queued", "running", "completed", "blocked"].includes(input.status)
      ? input.status
      : "queued",
    campaignId: text(input.campaignId, 150),
    source: text(input.source, 2000),
  };
}
export function checkGoalParent(row, id, goals) {
  const seen = new Set([id]);
  let current = row.parentId;
  while (current) {
    if (seen.has(current))
      throw new Error("Goals cannot form a circular hierarchy.");
    seen.add(current);
    const parent = goals.find((g) => g.id === current && !g.data.archived);
    if (!parent) throw new Error("Choose an existing active parent goal.");
    if (
      GOAL_PERIODS.indexOf(parent.data.period) <=
      GOAL_PERIODS.indexOf(row.period)
    )
      throw new Error("The parent must cover a longer goal period.");
    current = parent.data.parentId;
  }
}
export function goalProgress(goal) {
  if (
    goal.measurementType === "qualitative" ||
    goal.actual == null ||
    goal.regular == null
  )
    return null;
  const baseline = goal.baseline ?? (goal.direction === "decrease" ? null : 0);
  if (baseline == null) return null;
  const span =
    goal.direction === "decrease"
      ? baseline - goal.regular
      : goal.regular - baseline;
  if (span <= 0) return null;
  const change =
    goal.direction === "decrease"
      ? baseline - goal.actual
      : goal.actual - baseline;
  return Math.max(0, Math.min(100, Math.round((change / span) * 100)));
}

/** Autosaves in one writing session share a history snapshot; goal revisions stay explicit. */
export function planningHistory(existing, kind, at) {
  if (!existing) return [];
  const history = existing.history ?? [];
  const latest = history.at(-1);
  if (
    kind === "note" &&
    latest &&
    Date.parse(at) - Date.parse(latest.at) < 5 * 60 * 1000
  )
    return history;
  return [
    ...history,
    {
      revision: existing.revision,
      at: existing.updatedAt,
      data: existing.data,
    },
  ];
}

/** Agents may propose goals; only the operator can revise approved strategy. */
export function assertPlanningAuthority(kind, existing, proposed, actor) {
  if (actor !== "agent" || kind !== "goal") return;
  if (
    proposed.status === "committed" ||
    existing?.data.status === "committed"
  ) {
    throw new Error(
      "Only Jules can commit or change an approved goal. Record an observation or recommendation in Pathfinder instead.",
    );
  }
}
export function pricingScenario(input) {
  const monthly = number(input.monthly, true),
    hours = number(input.hours, true),
    hourlyCost = number(input.hourlyCost, true),
    tools = number(input.tools, true),
    contribution = number(input.contribution);
  const deliveryCost = hours * hourlyCost + tools;
  return {
    deliveryCost,
    contributionBeforeOverheads: monthly - deliveryCost,
    margin: monthly > 0 ? ((monthly - deliveryCost) / monthly) * 100 : null,
    extraWinsToCoverFee:
      contribution > 0 ? Math.ceil(monthly / contribution) : null,
  };
}
