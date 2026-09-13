import { requireAgentAuth } from "@/lib/agent-auth";
import { portalJson, readBoundedJson } from "@/lib/portal-http";
import { notebookFor, saveNotebook } from "@/lib/goal-notebook-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = requireAgentAuth(request);
  if (denied) return denied;
  try {
    const q = new URL(request.url).searchParams;
    return portalJson({
      record: await notebookFor(q.get("kind") || "", q.get("id") || ""),
    });
  } catch (e) {
    return portalJson(
      { error: e instanceof Error ? e.message : "Notebook unavailable." },
      { status: 400 },
    );
  }
}
export async function POST(request: Request) {
  const denied = requireAgentAuth(request);
  if (denied) return denied;
  try {
    return portalJson({
      record: await saveNotebook(
        (await readBoundedJson(request, 220000)) as Record<string, any>,
        "agent",
      ),
    });
  } catch (e) {
    return portalJson(
      { error: e instanceof Error ? e.message : "Notebook not saved." },
      { status: 409 },
    );
  }
}
