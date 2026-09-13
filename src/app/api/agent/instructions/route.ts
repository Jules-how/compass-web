import { requireAgentAuth } from "@/lib/agent-auth";
import { portalJson, readBoundedJson } from "@/lib/portal-http";
import { checkExplicitInstruction } from "@/lib/explicit-instruction";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { savePlanning } from "@/lib/planning-server";
import { currentPlanningRecord } from "@/lib/planning-persist.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = requireAgentAuth(request);
  if (auth) return auth;
  return portalJson({
    surfaces: {
      codex_local: process.env.COMPASS_INSTRUCTION_PUBLIC_KEY
        ? "configured"
        : "not_configured",
      chatgpt: "not_connected",
      chatgpt_work: "not_connected",
    },
    scopes: ["save_goal", "complete_task"],
    inferred_changes: "proposals",
  });
}
export async function POST(request: Request) {
  const auth = requireAgentAuth(request);
  if (auth) return auth;
  try {
    const {
      instruction: p,
      expired,
      digest,
    } = checkExplicitInstruction(
      await readBoundedJson(request, 150000),
      process.env.COMPASS_INSTRUCTION_PUBLIC_KEY || "",
    );
    const db = getPortalAdminClient(),
      command = p.command;
    if (command.action === "complete_task") {
      const { data: receipt, error } = await db
        .from("compass_instruction_receipts")
        .select("digest,result")
        .eq("request_id", p.request_id)
        .maybeSingle();
      if (error) throw new Error("Instruction receipt service is unavailable.");
      if (receipt) {
        if (receipt.digest !== digest) throw new Error("Request ID reused.");
        return portalJson({ ...receipt.result, replayed: true });
      }
      if (expired)
        throw new Error(
          "Instruction expired. Read the current task and renew the source-bound instruction.",
        );
      const { data, error: saveError } = await db.rpc(
        "compass_complete_task_instruction",
        { p, p_digest: digest },
      );
      if (saveError) throw new Error(saveError.message);
      return portalJson(data);
    }
    // Planning uses its own atomic encrypted receipt. An expired retry may read that receipt, never start another write.
    if (expired) {
      const { data: receipt } = await db
        .from("compass_planning_receipts")
        .select("request_id")
        .eq("request_id", p.request_id)
        .maybeSingle();
      if (!receipt)
        throw new Error(
          "Instruction expired. Read the goal before renewing it.",
        );
    }
    const row = await savePlanning(
      {
        kind: "goal",
        id: command.id,
        revision: command.revision,
        request_id: p.request_id,
        data: command.data,
      },
      "delegated_user",
      p,
      {
        actor: "delegated_user",
        issuer: p.issuer,
        source: p.source,
        request_id: p.request_id,
      },
    );
    return portalJson({
      record: currentPlanningRecord(row),
      actor: "delegated_user",
    });
  } catch (e) {
    return portalJson(
      { error: e instanceof Error ? e.message : "Instruction not applied." },
      { status: 409 },
    );
  }
}
