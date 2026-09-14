import { getPortalAdminClient } from "@/lib/portal-admin";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requirePortalAccess } from "@/lib/portal-access";
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/portal-http";
import { openCommercial } from "@/lib/agreement-server";
import { nextRepeatDay, dayKey } from "@/lib/day-planner.mjs";
import type { PlannerData } from "@/lib/day-planner-schema";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const origin = requireSameOrigin(request);
  if (origin) return origin;
  try {
    const { supabase } = await requirePortalAccess({ operator: true });
    const { taskId } = z
      .object({ taskId: z.string().min(1).max(200) })
      .parse(await readBoundedJson(request, 1000));
    const [{ data: task, error }, { data: setting, error: settingError }] =
      await Promise.all([
        supabase
          .from("compass_tasks")
          .select("*")
          .eq("id", taskId)
          .maybeSingle(),
        getPortalAdminClient()
          .from("compass_settings")
          .select("value")
          .eq("id", "workspace.day-planner.v1")
          .maybeSingle(),
      ]);
    if (error || settingError || !task || !setting)
      throw Error("Unable to read the recurring task.");
    const { data } = openCommercial<{ data: PlannerData }>(setting.value);
    const meta = data.tasks[taskId];
    if (!meta?.repeat || meta.repeat === "none")
      throw Error("This task does not repeat.");
    const day = nextRepeatDay(meta.day || dayKey(), meta.repeat)!;
    const root = meta.seriesId || taskId;
    const hash = createHash("sha256").update(`${root}:${day}`).digest("hex");
    const id = `task-${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
    const { data: existing } = await supabase
      .from("compass_tasks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (existing) return portalJson({ task: existing, day, seriesId: root });
    const { data: result, error: createError } = await supabase.rpc(
      "portal_operator_create_task_mutation",
      {
        p_task: {
          id,
          title: task.title,
          notes: task.notes,
          priority: task.priority,
          project_id: task.project_id,
          status: "not-started",
          source: `calendar-repeat:${root}:${day}`,
        },
      },
    );
    if (createError) {
      const { data: retry } = await supabase
        .from("compass_tasks")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (retry) return portalJson({ task: retry, day, seriesId: root });
      throw Error("Unable to create the next occurrence.");
    }
    if (!result?.task) throw Error("Unable to create the next occurrence.");
    return portalJson({ task: result.task, day, seriesId: root });
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : "Repeat failed." },
        { status: 400 },
      )
    );
  }
}
