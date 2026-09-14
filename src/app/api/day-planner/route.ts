import { createHash } from "node:crypto";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { requirePortalAccess } from "@/lib/portal-access";
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/portal-http";
import { sealCommercial, openCommercial } from "@/lib/agreement-server";
import { EMPTY_PLANNER, reducePlanner } from "@/lib/day-planner.mjs";
import { PlannerCommand, type PlannerData } from "@/lib/day-planner-schema";
const ID = "workspace.day-planner.v1";
type Stored = { revision: number; data: PlannerData; lastRequest?: string; lastDigest?: string };
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requirePortalAccess({ operator: true });
    const supabase = getPortalAdminClient();
    const { data, error } = await supabase
      .from("compass_settings")
      .select("value")
      .eq("id", ID)
      .maybeSingle();
    if (error) throw Error("Unable to load your planner.");
    return portalJson(
      data
        ? openCommercial<Stored>(data.value)
        : { revision: 0, data: EMPTY_PLANNER },
    );
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : "Load failed" },
        { status: 500 },
      )
    );
  }
}
export async function POST(request: Request) {
  const origin = requireSameOrigin(request);
  if (origin) return origin;
  try {
    await requirePortalAccess({ operator: true });
    const supabase = getPortalAdminClient();
    const body = (await readBoundedJson(request, 60000)) as {
      revision: number;
      requestId: string;
      command: unknown;
    };
    if (
      !Number.isInteger(body.revision) ||
      !/^[-\w]{10,100}$/.test(body.requestId || "")
    )
      throw Error("Invalid save request.");
    const command = PlannerCommand.parse(body.command);
    const digest = createHash("sha256")
      .update(JSON.stringify({ command, revision: body.revision }))
      .digest("hex");
    const { data: old, error } = await supabase
      .from("compass_settings")
      .select("value,updated_at")
      .eq("id", ID)
      .maybeSingle();
    if (error) throw Error("Unable to load current planner.");
    const stored: Stored = old
      ? openCommercial<Stored>(old.value)
      : { revision: 0, data: structuredClone(EMPTY_PLANNER) };
    if (stored.lastRequest === body.requestId) {
      if (stored.lastDigest !== digest)
        throw Error("This save ID was reused with different changes.");
      return portalJson(stored);
    }
    if (stored.revision !== body.revision)
      return portalJson(
        {
          error:
            "Your planner changed in another window. Reload and try again.",
          record: stored,
        },
        { status: 409 },
      );
    if (
      command.action === "task" ||
      (command.action === "timer" && command.taskId)
    ) {
      const id = command.action === "task" ? command.id : command.taskId!;
      const { data: task, error: taskError } = await supabase
        .from("compass_tasks")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (taskError || !task) throw Error("This task is no longer available.");
    }
    if (
      command.action === "task" &&
      command.patch.actualSeconds != null &&
      stored.data.timer?.taskId === command.id
    )
      throw Error("Stop the timer before editing actual time.");
    const next: Stored = {
      revision: stored.revision + 1,
      data: reducePlanner(stored.data, command),
      lastRequest: body.requestId,
      lastDigest: digest,
    };
    if (command.action === "task") {
      const meta = next.data.tasks[command.id];
      if (
        meta.start != null &&
        (!meta.day || meta.start + (meta.planned || 30) > 1440)
      )
        throw Error("Choose a date and a block that fits within the day.");
    }
    if (JSON.stringify(next).length > 700000)
      throw Error(
        "Planner storage is full. Export older records before continuing.",
      );
    const stamp = new Date(
      Math.max(Date.now(), old ? Date.parse(old.updated_at) + 1 : 0),
    ).toISOString();
    const value = sealCommercial(next);
    if (old) {
      const { data: updated, error: saveError } = await supabase
        .from("compass_settings")
        .update({ value, updated_at: stamp, mirrored_at: stamp })
        .eq("id", ID)
        .eq("updated_at", old.updated_at)
        .select("id");
      if (saveError) throw Error("Unable to save. Your draft is still here.");
      if (!updated?.length)
        return portalJson(
          { error: "Planner changed during saving. Reload and retry." },
          { status: 409 },
        );
    } else {
      const { error: insertError } = await supabase
        .from("compass_settings")
        .insert({
          id: ID,
          value,
          scope: "workspace",
          is_secret: 1,
          updated_at: stamp,
          mirrored_at: stamp,
        });
      if (insertError)
        return portalJson(
          { error: "Planner changed during saving. Reload and retry." },
          { status: 409 },
        );
    }
    return portalJson(next);
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : "Save failed" },
        { status: 400 },
      )
    );
  }
}
