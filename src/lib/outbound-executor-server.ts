import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OUTBOUND_TOOL_CATALOGUE,
  type ExecutorSession,
  type ExecutorCatalogue,
} from "./outbound-executor";
import { canonicalPipeline, PipelineError } from "./outbound-pipeline-schema";
import {
  pipelineDatabaseError,
  requirePipeline,
} from "./outbound-pipeline-server";
const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_:.-]+$/);
const capability = z.strictObject({
  id,
  stages: z
    .array(z.enum(["research", "contacts", "verify", "write"]))
    .min(1)
    .max(4),
  adapter_version: z.string().min(1).max(100),
  tool_name: z.string().min(1).max(300),
  probe: z.strictObject({
    status: z.enum(["ready", "unavailable"]),
    checked_at: z.iso
      .datetime({ offset: true })
      .refine(
        (v) =>
          Date.parse(v) <= Date.now() + 60000 &&
          Date.parse(v) > Date.now() - 600000,
        "Probe must be within ten minutes",
      ),
    detail: z.string().min(1).max(1000),
  }),
});
const schema = z.strictObject({
  request_id: id,
  session_id: id,
  expected_revision: z.number().int().nonnegative(),
  action: z.enum(["register", "heartbeat", "attach"]),
  data: z.unknown(),
});
const dataSchemas = {
  register: z.strictObject({
    name: z.string().min(1).max(200),
    tools: z.array(capability).max(50),
  }),
  heartbeat: z.strictObject({}),
  attach: z.strictObject({ item_id: id, lease_token: id }),
};
export async function readOutboundExecutors(
  db: SupabaseClient,
): Promise<ExecutorCatalogue> {
  requirePipeline();
  const result = await db
    .from("outbound_executor_sessions")
    .select("id,name,revision,expires_at,tools")
    .gt("expires_at", new Date().toISOString())
    .order("id")
    .limit(50);
  pipelineDatabaseError(result.error);
  const sessions = (result.data || []) as ExecutorSession[];
  const catalogue: ExecutorCatalogue['tools'] = [...OUTBOUND_TOOL_CATALOGUE].map((tool) => {
    const capabilities = sessions
      .flatMap((s) => s.tools)
      .filter(
        (t) =>
          t.id === tool.id &&
          t.probe.status === "ready" &&
          Date.parse(t.probe.checked_at) > Date.now() - 600000 &&
          tool.stages.some((stage) => t.stages.includes(stage)),
      );
    const ready = capabilities.sort((a, b) =>
      b.probe.checked_at.localeCompare(a.probe.checked_at),
    )[0];
    return {
      ...tool,
      available: !!ready,
      available_stages: [...new Set(capabilities.flatMap((t) => t.stages))],
      checked_at: ready?.probe.checked_at || null,
      reason: ready
        ? "Checked by connected agent"
        : "Connect an agent and check this adapter before execution.",
    };
  });
  for (const tool of sessions.flatMap((s) => s.tools)) {
    if (catalogue.some((t) => t.id === tool.id)) continue;
    catalogue.push({
      id: tool.id,
      label: tool.id,
      stages: tool.stages,
      description: "Custom saved adapter reported by connected agent.",
      available:
        tool.probe.status === "ready" &&
        Date.parse(tool.probe.checked_at) > Date.now() - 600000,
      available_stages:
        tool.probe.status === "ready" &&
        Date.parse(tool.probe.checked_at) > Date.now() - 600000
          ? tool.stages
          : [],
      checked_at: tool.probe.checked_at,
      reason: tool.probe.detail,
    });
  }
  return { executor: "connected_agent", sessions, tools: catalogue };
}
export async function writeOutboundExecutor(
  db: SupabaseClient,
  input: unknown,
  actor: string,
) {
  requirePipeline(true);
  if (actor !== "agent")
    throw new PipelineError("pipeline_agent_session_required");
  const envelope = schema.safeParse(input);
  if (!envelope.success)
    throw new PipelineError("pipeline_invalid_executor_command");
  const parsed = dataSchemas[envelope.data.action].safeParse(
    envelope.data.data,
  );
  if (!parsed.success)
    throw new PipelineError("pipeline_invalid_executor_data");
  const command = { ...envelope.data, data: parsed.data };
  if (
    command.action === "register" &&
    "tools" in command.data &&
    new Set(command.data.tools.map((t) => t.id)).size !==
      command.data.tools.length
  )
    throw new PipelineError("pipeline_duplicate_tool_capability");
  const result = await db.rpc("outbound_executor_command", {
    p_command: command,
    p_hash: createHash("sha256")
      .update(canonicalPipeline(command))
      .digest("hex"),
    p_actor: actor,
  });
  pipelineDatabaseError(result.error);
  return result.data;
}
