import { z } from "zod";
import type { CompassTask } from "./types";
export const CITIES = [
  "Sydney",
  "Brisbane",
  "Melbourne",
  "Perth",
  "ACT",
] as const;
export const cityZone = (city: string) =>
  city === "Perth"
    ? "Australia/Perth"
    : city === "Brisbane"
      ? "Australia/Brisbane"
      : "Australia/Sydney";
export const sessionCommand = z
  .object({
    id: z.string().uuid(),
    request_id: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    goal_id: z.string().regex(/^planning\.goal\.[a-f0-9-]{36}$/),
    city: z.enum(CITIES),
    phase: z.enum(["warmup", "priority", "finish"]).default("warmup"),
    lead_ids: z.array(z.string().min(1).max(200)).max(500),
    priorities: z
      .record(
        z.string(),
        z.object({
          tier: z.enum(["high", "medium", "lower", "unknown"]),
          reason: z.string().max(2000),
        }),
      )
      .default({}),
    status: z.enum(["ready", "paused", "finished"]).default("ready"),
    due: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
  })
  .strict()
  .refine(
    (p) =>
      Object.entries(p.priorities).every(
        ([id, rank]) =>
          p.lead_ids.includes(id) &&
          (rank.tier === "unknown" || rank.reason.trim().length > 0),
      ),
    "Rank only selected prospects and explain each priority.",
  )
  .refine(
    (p) => new Set(p.lead_ids).size === p.lead_ids.length,
    "Choose each prospect once.",
  );
export type GoalSession = {
  id: string;
  revision: number;
  updated_at: string;
  data: z.infer<typeof sessionCommand> & {
    task_id: string;
    handled_ids: string[];
    last_touch_id?: string;
  };
};
export function sessionQueue(
  session: GoalSession,
  eligible: string[],
  promised: string[] = [],
) {
  const ids = session.data.lead_ids.filter(
    (id) => eligible.includes(id) && !session.data.handled_ids?.includes(id),
  );
  const due = [...new Set(promised)].filter(
    (id) => session.data.lead_ids.includes(id) && eligible.includes(id),
  );
  const fresh = ids.filter((id) => !due.includes(id));
  const lower = fresh.filter(
    (id) => session.data.priorities[id]?.tier === "lower",
  );
  const warmIds = session.data.lead_ids
    .filter((id) => session.data.priorities[id]?.tier === "lower")
    .slice(0, 10);
  const warm = lower.filter((id) => warmIds.includes(id)),
    finish = lower.filter((id) => !warmIds.includes(id));
  const priority = fresh
    .filter((id) =>
      ["high", "medium"].includes(session.data.priorities[id]?.tier),
    )
    .sort(
      (a, b) =>
        Number(session.data.priorities[a]?.tier !== "high") -
        Number(session.data.priorities[b]?.tier !== "high"),
    );
  const unknown = fresh.filter(
    (id) => !lower.includes(id) && !priority.includes(id),
  );
  return {
    due,
    warm,
    priority,
    finish,
    unknown,
    ordered: [
      ...due,
      ...(session.data.phase === "warmup"
        ? warm
        : session.data.phase === "priority"
          ? priority
          : finish),
      ...unknown,
    ],
  };
}
export function localDay(value: string | Date, timezone = "Australia/Sydney") {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
}
export function weekDays(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
export function taskDay(task: CompassTask) {
  return task.due
    ? localDay(task.due, (task as any).outreach_timezone || "Australia/Sydney")
    : "";
}
export function goalMeasures(
  observations: any[],
  touches: any[],
  from = "0000-01-01",
  through = "9999-12-31",
) {
  const payments = new Map<string, any>(),
    refunds = new Map<string, number>();
  for (const o of observations) {
    const r = o.receipt;
    if (
      !r ||
      o.provenance === "estimate" ||
      r.currency !== "AUD" ||
      r.received_on < from ||
      r.received_on > through
    )
      continue;
    if (r.kind === "refund") refunds.set(r.receipt_id, r.amount);
    else payments.set(r.payment_id, r);
  }
  const clients = new Map<string, number>();
  for (const p of payments.values())
    clients.set(p.client_id, (clients.get(p.client_id) || 0) + p.amount);
  const events = [
    ...new Map(
      touches
        .filter(
          (t) =>
            localDay(t.contacted_at) >= from &&
            localDay(t.contacted_at) <= through,
        )
        .map((t) => [t.id, t]),
    ).values(),
  ];
  const calls = events.filter((t) => t.request_payload?.conversation === true);
  const identity = (t: any) => t.business_key || t.contact_id;
  return {
    paid: payments.size
      ? [...clients.values()].filter((amount) => amount >= 2500).length
      : null,
    cash: payments.size
      ? [...payments.values()].reduce((n, p) => n + p.amount, 0)
      : null,
    refunds: [...refunds.values()].reduce((a, b) => a + b, 0),
    positive: calls.filter((t) => t.request_payload?.signals?.length).length,
    conversations: calls.length,
    businesses: new Set(calls.map(identity)).size,
    coverage: new Set(
      events
        .filter((t) =>
          [
            "office_reached",
            "decision_maker",
            "information_requested",
            "meeting_agreed",
            "meeting_held",
            "not_now",
            "not_interested",
            "do_not_contact",
          ].includes(t.outcome),
        )
        .map(identity),
    ).size,
  };
}
