import "server-only";
import { createHash } from "node:crypto";
import { getPlanning, savePlanning } from "./planning-server";
import { getPortalAdminClient } from "./portal-admin";
import { currentPlanningRecord } from "./planning-persist.mjs";

export async function notebookFor(kind: string, subjectId: string) {
  if (
    !["goal", "contact"].includes(kind) ||
    !/^[-a-zA-Z0-9_.:]{1,200}$/.test(subjectId)
  )
    throw new Error("Choose a goal or contact.");
  let title = "",
    text = "";
  if (kind === "goal") {
    const goal = await getPlanning("goal", subjectId);
    if (!goal || goal.data.archived) throw new Error("Goal not found.");
    title = goal.data.title;
    text = goal.data.notes || "";
  } else {
    const { data, error } = await getPortalAdminClient()
      .from("lead_contacts")
      .select("id,company,name")
      .eq("id", subjectId)
      .maybeSingle();
    if (error || !data) throw new Error("Contact not found.");
    title = data.company || data.name || "Contact";
  }
  const digest = createHash("sha256")
    .update(`compass-notebook:${kind}:${subjectId}`)
    .digest("hex")
    .slice(0, 32);
  const uuid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20)}`;
  const id = `planning.note.${uuid}`;
  const saved = await getPlanning("note", id);
  return saved
    ? currentPlanningRecord(saved)
    : {
        id,
        kind: "note",
        revision: 0,
        data: {
          title: `${title} — notebook`,
          body: text,
          goalId: kind === "goal" ? subjectId : "",
          subject: { kind, id: subjectId },
          date: "",
          status: "idea",
          archived: false,
          links: "",
        },
      };
}
export async function saveNotebook(
  input: Record<string, any>,
  actor: "operator" | "agent",
) {
  const current = await notebookFor(input.subject?.kind, input.subject?.id);
  if (!input.request_id)
    throw new Error("A notebook save requires a request ID.");
  const taskIds = new Set<string>();
  function collect(n: any) {
    if (n?.type === "compassTask") taskIds.add(n.attrs?.taskId);
    if (Array.isArray(n?.content)) n.content.forEach(collect);
  }
  collect(input.document?.content);
  if (taskIds.size) {
    const { data, error } = await getPortalAdminClient()
      .from("compass_tasks")
      .select("id")
      .in("id", [...taskIds]);
    if (error || data?.length !== taskIds.size)
      throw new Error(
        "A linked action no longer exists. Keep the note text and review its link.",
      );
  }
  const row = await savePlanning(
    {
      kind: "note",
      id: current.id,
      revision: input.revision,
      request_id: input.request_id,
      data: { ...current.data, document: input.document },
    },
    actor,
    { subject: input.subject, document: input.document },
  );
  return currentPlanningRecord(row);
}
