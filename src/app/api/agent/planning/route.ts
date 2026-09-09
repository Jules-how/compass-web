import { requireAgentAuth } from "@/lib/agent-auth";
import { portalJson, readBoundedJson } from "@/lib/portal-http";
import { getPlanning, listPlanning, savePlanning } from "@/lib/planning-server";
import { currentPlanningRecord } from "@/lib/planning-persist.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = requireAgentAuth(request);
  if (auth) return auth;
  try {
    const q = new URL(request.url).searchParams;
    const p = Number(q.get("page") || 0);
    if (!Number.isInteger(p) || p < 0) throw new Error("Invalid page.");
    const kind = q.get("kind") || "goal";
    const id = q.get("id");
    const record = id ? await getPlanning(kind, id) : null;
    const result = id
      ? { records: record ? [record] : [], total: record ? 1 : 0, page: 0 }
      : await listPlanning(kind, p);
    return portalJson(q.get("include_history") === "true" ? result : {
      ...result,
      records: result.records.map(currentPlanningRecord),
    });
  } catch (e) {
    return portalJson(
      { error: e instanceof Error ? e.message : "Unable to load." },
      { status: 400 },
    );
  }
}
export async function POST(request: Request) {
  const auth = requireAgentAuth(request);
  if (auth) return auth;
  try {
    const body = await readBoundedJson(request, 50000);
    return portalJson({
      record: await savePlanning(body as Parameters<typeof savePlanning>[0], "agent"),
    });
  } catch (e) {
    return portalJson(
      { error: e instanceof Error ? e.message : "Unable to save." },
      { status: 400 },
    );
  }
}
