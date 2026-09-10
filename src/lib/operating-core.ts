import { z } from "zod";

const id = z.string().trim().min(1).max(200);
const text = z.string().trim().max(8000);
const stamp = z.string().datetime({ offset: true });
export const operatingContext = z
  .object({
    domain: z.enum(["business", "personal"]).default("business"),
    reason: text.min(1),
    next_action: text.min(1),
    done_when: text.min(1),
    source: text.min(1),
    source_kind: z
      .enum(["explicit", "agent", "provider", "document", "activity"])
      .default("agent"),
    state: z
      .enum(["ready", "proposed", "blocked", "awaiting_confirmation"])
      .default("proposed"),
    owner: z.enum(["Jules", "agent"]).default("Jules"),
    goal_id: z.string().max(200).default(""),
    campaign_id: z.string().max(200).default(""),
    links: z
      .array(
        z.object({
          label: z.string().max(150),
          url: z
            .string()
            .max(2000)
            .refine(safeLink, "Use an application or HTTPS link"),
        }),
      )
      .max(20)
      .default([]),
    depends_on: z.array(id).max(30).default([]),
    available_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    estimate_minutes: z
      .number()
      .int()
      .min(1)
      .max(10080)
      .nullable()
      .default(null),
    evidence: z
      .array(z.object({ detail: text, source: text, at: stamp }))
      .max(30)
      .default([]),
    blocker: text.default(""),
  })
  .strict();
export type WorkContext = z.infer<typeof operatingContext>;
export type WorkTask = {
  id: string;
  title: string;
  status: string;
  priority: number;
  task_type?: string | null;
  source?: string | null;
  due: string | null;
  notes?: string | null;
  project_id?: string | null;
  lead_id?: string | null;
  updated_at: string;
  operating_context?: Partial<WorkContext>;
  outreach_state?: string;
};
export type OperatingRecord = {
  id: string;
  kind: string;
  revision: number;
  updated_at: string;
  data: Record<string, any>;
};
export function safeLink(url: string) {
  return (
    /^\/(?!\/)/.test(url) ||
    /^https:\/\//.test(url) ||
    /^codex:\/\/threads\//.test(url)
  );
}
export function sydneyDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function dateOnly(value: string | null | undefined) {
  if (!value) return "";
  return value.includes("T") && Number.isFinite(Date.parse(value))
    ? sydneyDay(new Date(value))
    : value.slice(0, 10);
}
export function calendarCommitments(
  records: OperatingRecord[],
  from: string,
  to: string,
) {
  const source = records.find((r) => r.id === "source:calendar");
  const events = Array.isArray(source?.data.events) ? source.data.events : [];
  return events
    .filter(
      (e: any) =>
        e.start &&
        e.end &&
        e.my_response_status !== "declined" &&
        dateOnly(e.start) <= to &&
        dateOnly(e.end) >= from,
    )
    .map((e: any) => ({
      id: String(e.id),
      title: String(e.summary || "Calendar commitment"),
      start: String(e.start),
      end: String(e.end),
      url: safeLink(String(e.url || "")) ? String(e.url) : "",
      domain: String(e.domain || "unclassified"),
    }))
    .sort((a: any, b: any) => a.start.localeCompare(b.start));
}
export const openTask = (task: WorkTask) =>
  !["completed", "cancelled", "done", "canceled"].includes(task.status);
export function campaignState(
  detail: Record<string, any> | undefined,
  analytics: Record<string, any> | undefined,
  at: string | null,
) {
  const status =
    (
      {
        "0": "draft",
        "1": "active",
        "2": "paused",
        "3": "completed",
        "4": "active",
        "-1": "accounts unhealthy",
        "-2": "bounce protection",
        "-99": "suspended",
      } as Record<string, string>
    )[String(detail?.status ?? analytics?.campaign_status)] || "unknown";
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const loaded = number(analytics?.leads_count),
    contacted = number(analytics?.contacted_count);
  return {
    status,
    observed_at: at,
    sent: number(analytics?.emails_sent_count),
    loaded,
    contacted,
    remaining_first_contacts:
      loaded !== null && contacted !== null
        ? Math.max(0, loaded - contacted)
        : null,
    replies: number(analytics?.reply_count_unique),
    next_send_at: null,
    analytics_available: !!analytics,
  };
}

/** Stable, explainable priority; never equate a proposal or blocked prerequisite with ready work. */
export function operatingQueue(
  tasks: WorkTask[],
  day: string,
  acceptedIds: string[] = [],
) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const waiting: Array<WorkTask & { reason: string }> = [],
    proposals: WorkTask[] = [],
    confirmation: WorkTask[] = [];
  const ready: Array<WorkTask & { reason: string; rank: number }> = [];
  for (const task of tasks.filter(openTask)) {
    const c = task.operating_context || {};
    if (c.state === "awaiting_confirmation") {
      confirmation.push(task);
      continue;
    }
    const unfinished = (c.depends_on || []).filter(
      (id) =>
        !["completed", "done"].includes(byId.get(id)?.status || "missing"),
    );
    if (
      task.status === "blocked" ||
      c.state === "blocked" ||
      unfinished.length ||
      (c.available_on && c.available_on > day)
    ) {
      waiting.push({
        ...task,
        reason:
          c.blocker ||
          (unfinished.length
            ? "Waiting for prerequisites"
            : c.available_on && c.available_on > day
              ? `Available ${c.available_on}`
              : "Blocked"),
      });
      continue;
    }
    if (
      (!c.reason && task.outreach_state !== "accepted") ||
      c.state === "proposed" ||
      task.outreach_state === "proposed" ||
      task.outreach_state === "unresolved"
    ) {
      proposals.push(task);
      continue;
    }
    const due = dateOnly(task.due),
      isDue = !!due && due <= day;
    const reason = isDue
      ? due < day
        ? "Overdue commitment"
        : "Due today"
      : task.status === "in-progress"
        ? "Continue work in progress"
        : c.goal_id
          ? "Advances an agreed goal"
          : "Ready work";
    // Existing priorities are 1 urgent, 2 high, 3 medium, 4 low; zero is unspecified.
    ready.push({
      ...task,
      reason,
      rank:
        (isDue
          ? 0
          : task.status === "in-progress"
            ? 100
            : c.goal_id
              ? 200
              : 300) + (task.priority > 0 ? task.priority : 5),
    });
  }
  ready.sort(
    (a, b) =>
      a.rank - b.rank ||
      (dateOnly(a.due) || "9999").localeCompare(dateOnly(b.due) || "9999") ||
      a.id.localeCompare(b.id),
  );
  const recommended = ready.map((t) => t.id);
  const accepted = acceptedIds.filter((id) => ready.some((t) => t.id === id));
  const interruption =
    accepted.length > 0 &&
    accepted.some((id, index) => recommended[index] !== id);
  const order = accepted.length
    ? [...accepted, ...recommended.filter((id) => !accepted.includes(id))]
    : recommended;
  return {
    queue: order.map((id) => ready.find((t) => t.id === id)!),
    recommended,
    interruption,
    waiting,
    proposals,
    confirmation,
  };
}

export const operatingCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("task"),
      request_id: id,
      key: id,
      id: id.optional(),
      expected_updated_at: stamp.optional(),
      context: operatingContext,
      task: z
        .object({
          title: z.string().trim().min(1).max(250),
          status: z
            .enum([
              "not-started",
              "in-progress",
              "blocked",
              "completed",
              "cancelled",
            ])
            .optional(),
          priority: z.number().int().min(0).max(4).optional(),
          due: z.string().nullable().optional(),
          notes: text.optional(),
          project_id: id.nullable().optional(),
          task_type: z
            .enum(["SELL", "BUILD", "DELIVER", "THINK", "ADMIN"])
            .optional(),
          source: z.string().max(250).default("operating-service"),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("project"),
      request_id: id,
      key: id,
      id: id.optional(),
      expected_updated_at: stamp.optional(),
      context: operatingContext,
      project: z
        .object({ name: z.string().min(1).max(250), summary: text })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("record"),
      request_id: id,
      id,
      revision: z.number().int().min(0),
      kind: z.enum(["source", "preparation", "capture", "preferences"]),
      data: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      action: z.literal("review_day"),
      request_id: id,
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      revision: z.number().int().min(0),
      task_ids: z.array(id).max(100),
      task_versions: z.record(z.string(), stamp),
    })
    .strict(),
  z
    .object({
      action: z.literal("complete"),
      request_id: id,
      id,
      expected_updated_at: stamp,
    })
    .strict(),
  z.object({ action: z.literal("refresh") }).strict(),
]);
