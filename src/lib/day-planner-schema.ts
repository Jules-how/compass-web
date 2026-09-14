import { z } from "zod";
import { validDay } from "./day-planner.mjs";
const day = z.string().refine(validDay, "Invalid date");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const key = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\w.:-]+$/);
export const PlannerTaskSchema = z
  .object({
    day: day.nullable().optional(),
    start: z.number().int().min(0).max(1439).nullable().optional(),
    planned: z.number().int().min(0).max(1440).nullable().optional(),
    actualSeconds: z.number().int().min(0).max(31536000).optional(),
    channel: key.optional(),
    rank: z.number().finite().optional(),
    archived: z.boolean().optional(),
    repeat: z
      .enum(["none", "daily", "weekdays", "weekly", "monthly"])
      .optional(),
    seriesId: z.string().max(200).optional(),
    goalId: z.string().max(200).optional(),
    eventId: z.string().max(300).nullable().optional(),
    calendarId: z.string().max(300).optional(),
    sourceUrl: z.string().url().max(2000).optional(),
    richNotes: z.string().max(30000).optional(),
    comments: z
      .array(
        z.object({
          id: key,
          text: z.string().min(1).max(4000),
          at: z.string().datetime(),
        }),
      )
      .max(200)
      .optional(),
  })
  .strict();
const DaySchema = z
  .object({
    notes: z.string().max(12000).optional(),
    reflection: z.string().max(12000).optional(),
    weeklyNotes: z.string().max(12000).optional(),
    planned: z.boolean().optional(),
    shutdown: z.boolean().optional(),
    shutdownTime: time.optional(),
  })
  .strict();
const SettingsSchema = z
  .object({
    start: time.optional(),
    shutdown: time.optional(),
    capacity: z.number().int().min(15).max(1440).optional(),
    pomodoro: z.number().int().min(1).max(180).optional(),
    breakMinutes: z.number().int().min(1).max(60).optional(),
  })
  .strict();
export const PlannerCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("task"), id: key, patch: PlannerTaskSchema }),
  z.object({ action: z.literal("day"), day, patch: DaySchema }),
  z.object({ action: z.literal("settings"), patch: SettingsSchema }),
  z.object({
    action: z.literal("channels"),
    channels: z
      .array(
        z.object({
          id: key,
          name: z.string().min(1).max(80),
          color: z.string().regex(/^#[0-9a-f]{6}$/i),
        }),
      )
      .min(1)
      .max(50),
  }),
  z.object({
    action: z.literal("timer"),
    taskId: key.nullable(),
    mode: z.enum(["focus", "pomodoro"]).optional(),
  }),
]);
export type PlannerTask = z.infer<typeof PlannerTaskSchema>;
export type PlannerData = {
  version: number;
  tasks: Record<string, PlannerTask>;
  days: Record<string, z.infer<typeof DaySchema>>;
  channels: { id: string; name: string; color: string }[];
  settings: {
    start: string;
    shutdown: string;
    capacity: number;
    pomodoro: number;
    breakMinutes: number;
  };
  timer: null | {
    taskId: string;
    startedAt: string;
    mode: string;
    durationSeconds: number;
  };
};
