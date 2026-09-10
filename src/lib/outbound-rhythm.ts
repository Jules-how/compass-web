import { z } from "zod";
import type { CompassTask, LeadContact } from "@/lib/types";

export const OUTCOMES = {
  no_answer: "No answer",
  invalid_route: "Invalid or disconnected route",
  office_reached: "Office / gatekeeper reached",
  decision_maker: "Decision-maker conversation",
  information_requested: "Information requested",
  meeting_agreed: "Meeting agreed",
  meeting_held: "Meeting held",
  not_now: "Not now",
  not_interested: "Not interested",
  do_not_contact: "Do not contact",
  next_step: "Next action planned",
} as const;
export const timeZone = z
  .string()
  .min(1)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone");
const next = z.object({
  title: z.string().trim().min(1).max(250),
  channel: z.enum(["call", "email", "sms", "other"]),
  reason: z.string().max(2000),
  timezone: timeZone,
  due: z.string().datetime({ offset: true }),
  state: z.enum(["proposed", "accepted"]),
  sms_basis: z.string().max(1000).optional(),
});
const identity = {
  lead_id: z.string().min(1).max(200),
  revision: z.number().int().nonnegative(),
};
export const rhythmCommand = z
  .discriminatedUnion("operation", [
    z.object({
      operation: z.literal("select"),
      ...identity,
      selected: z.boolean(),
      timezone: timeZone,
    }),
    z.object({
      operation: z.literal("capture"),
      ...identity,
      request_id: z.string().uuid(),
      occurred_at: z.string().datetime({ offset: true }),
      channel: z.enum(["call", "email", "sms", "other"]),
      direction: z.enum(["inbound", "outbound"]),
      outcome: z.enum(
        Object.keys(OUTCOMES) as [
          keyof typeof OUTCOMES,
          ...(keyof typeof OUTCOMES)[],
        ],
      ),
      note: z.string().max(4000),
      person_reached: z.string().max(250),
      disposition: z.enum(["schedule", "closed", "unresolved"]),
      restriction: z
        .enum(["all", "call", "email", "sms", "unknown"])
        .optional(),
      next: next.optional(),
      task_id: z.string().optional(),
      expected_updated_at: z.string().optional(),
      complete_task: z.boolean().optional(),
      additional: z.boolean().optional(),
    }),
    z.object({
      operation: z.literal("task"),
      ...identity,
      task_id: z.string().min(1),
      expected_updated_at: z.string().min(1),
      task_status: z.enum(["completed", "cancelled"]).optional(),
      next: next.optional(),
    }),
    z.object({
      operation: z.literal("preferences"),
      revision: z.number().int().nonnegative(),
      call_target: z.number().int().min(0).max(200),
      ready_days: z.number().int().min(1).max(14),
    }),
    z.object({
      operation: z.literal("work"),
      request_id: z.string().uuid(),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      category: z.enum(["preparation", "selling", "systems"]),
      minutes: z.number().int().min(1).max(1440),
      note: z.string().max(2000),
    }),
  ])
  .superRefine((p, ctx) => {
    if (p.operation === "capture") {
      if (p.disposition === "schedule" && !p.next)
        ctx.addIssue({
          code: "custom",
          message: "Set the next action and time",
          path: ["next"],
        });
      if (p.disposition === "closed" && !p.note.trim())
        ctx.addIssue({
          code: "custom",
          message: "Add the closure reason",
          path: ["note"],
        });
      if (p.outcome === "do_not_contact" && !p.restriction)
        ctx.addIssue({
          code: "custom",
          message: "Record which channels were restricted",
          path: ["restriction"],
        });
      if (p.complete_task && (!p.task_id || !p.expected_updated_at))
        ctx.addIssue({
          code: "custom",
          message: "Reload the action before completing it",
          path: ["task_id"],
        });
      if (new Date(p.occurred_at).getTime() > Date.now() + 60000)
        ctx.addIssue({
          code: "custom",
          message: "An interaction cannot be in the future",
          path: ["occurred_at"],
        });
    }
    if (p.operation === "task" && !p.next && !p.task_status)
      ctx.addIssue({
        code: "custom",
        message: "Choose a task change",
        path: ["task_status"],
      });
    if ("next" in p && p.next?.channel === "sms" && !p.next.sms_basis?.trim())
      ctx.addIssue({
        code: "custom",
        message: "Record the invitation or agreement to text",
        path: ["next", "sms_basis"],
      });
  });
export type RhythmCommand = z.infer<typeof rhythmCommand>;
export type RhythmLead = LeadContact & {
  rhythm_disposition: string | null;
  rhythm_last_interaction_at: string | null;
  rhythm_revision: number;
  rhythm_timezone: string | null;
  rhythm_selected_at: string | null;
  rhythm_offer_key: string | null;
  contact_restrictions: Record<string, unknown>;
};
export type RhythmTask = CompassTask & {
  lead_id: string;
  outreach_channel: string;
  outreach_reason: string | null;
  outreach_timezone: string | null;
  outreach_state: "proposed" | "accepted" | "unresolved";
  outreach_primary: boolean;
  originating_touch_id: string | null;
};
export type RhythmTouch = {
  id: string;
  contact_id: string;
  contacted_at: string;
  channel: string;
  direction: string | null;
  outcome: string | null;
  note: string | null;
  person_reached: string | null;
  source: string;
  disposition: string | null;
};
export function dayKey(value: string | Date, zone = "Australia/Sydney") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function localDateTimeToIso(value: string, zone: string) {
  timeZone.parse(zone);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Choose a date and time");
  const target = Date.parse(value + "Z");
  const matches: string[] = [];
  // Cover all UTC offsets, including half/quarter hours; reject DST gaps and overlaps.
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const date = new Date(target + offset * 60000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === value)
      matches.push(date.toISOString());
  }
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? "This time occurs twice during daylight saving. Choose another time."
        : "This local time does not exist. Choose another time.",
    );
  return matches[0];
}
export function restrictionReason(lead: RhythmLead, channel: string) {
  const r = lead.contact_restrictions || {};
  if (r.all || r.unknown || r[channel])
    return "Contact restricted — review before action";
  if (
    lead.suppression_reason &&
    !/bounced|invalid|manual_email_only/i.test(lead.suppression_reason)
  )
    return "Suppressed — review contact permission";
  if (
    channel === "email" &&
    (lead.recontact_ok === 0 ||
      !["valid", "ok"].includes(lead.email_verify_status || "") ||
      !lead.email)
  )
    return "Email not cleared";
  if (channel === "call" && !lead.phone) return "Phone missing";
  return null;
}
export function isOpen(t: RhythmTask) {
  return !["completed", "cancelled"].includes(t.status);
}
export function rankActions(tasks: RhythmTask[], now = new Date()) {
  const group = (t: RhythmTask) =>
    t.outreach_state === "accepted" && t.due && new Date(t.due) <= now
      ? 0
      : t.outreach_state === "unresolved"
        ? 1
        : 2;
  return [...tasks]
    .filter(isOpen)
    .sort(
      (a, b) =>
        group(a) - group(b) ||
        (Date.parse(a.due || "") || Infinity) -
          (Date.parse(b.due || "") || Infinity) ||
        b.priority - a.priority ||
        a.id.localeCompare(b.id),
    );
}
export function callWindow(zone: string | null, now = new Date()) {
  if (!zone) return "Timezone unknown";
  const p = new Intl.DateTimeFormat("en-AU", {
    timeZone: zone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const d = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return ["Sat", "Sun"].includes(d.weekday) ||
    Number(d.hour) < 9 ||
    Number(d.hour) >= 17
    ? "Outside 9am–5pm local calling window"
    : null;
}
export function weeklyOutcomes(touches: RhythmTouch[]) {
  const calls = touches.filter(
    (x) =>
      x.channel === "call" &&
      x.direction === "outbound" &&
      x.outcome !== "next_step",
  );
  return {
    callAttempts: calls.length,
    uniqueCalled: new Set(calls.map((x) => x.contact_id)).size,
    officeConversations: calls.filter((x) => x.outcome === "office_reached")
      .length,
    decisionMakerConversations: calls.filter(
      (x) => x.outcome === "decision_maker",
    ).length,
    meetingsBooked: touches.filter(
      (x) =>
        x.outcome === "meeting_agreed" || x.outcome === "lead_meeting_booked",
    ).length,
    meetingsHeld: touches.filter(
      (x) =>
        x.outcome === "meeting_held" || x.outcome === "lead_meeting_completed",
    ).length,
    emailSends: touches.filter((x) => x.outcome === "email_sent").length,
    humanReplies: touches.filter((x) => x.outcome === "reply_received").length,
  };
}
