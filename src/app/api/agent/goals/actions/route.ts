import { requirePortalAccess } from "@/lib/portal-access";
import { requireAgentAuth } from "@/lib/agent-auth";
import { getPortalAdminClient } from "@/lib/portal-admin";
import {
  portalJson,
  portalAccessResponse,
  requireSameOrigin,
  readBoundedJson,
} from "@/lib/portal-http";
import {
  loadGoalActions,
  goalProspects,
  goalEvidence,
  saveGoalSession,
  sessionContacts,
} from "@/lib/goal-actions-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const denied = requireAgentAuth(request);
    if (denied) return denied;
    const db = getPortalAdminClient();
    void db;
    const q = new URL(request.url).searchParams;
    return portalJson(
      q.get("section") === "session"
        ? await sessionContacts(q.get("id") || "")
        : q.get("section") === "prospects"
          ? await goalProspects(q)
          : q.get("section") === "evidence"
            ? await goalEvidence(q.get("goal") || "")
            : await loadGoalActions(),
    );
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : "Workspace unavailable." },
        { status: 400 },
      )
    );
  }
}
export async function POST(request: Request) {
  try {
    const denied = requireAgentAuth(request);
    if (denied) return denied;
    const db = getPortalAdminClient();
    return portalJson(
      await saveGoalSession(
        db,
        await readBoundedJson(request, 150000),
        "agent",
      ),
    );
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : "Session not saved." },
        { status: 409 },
      )
    );
  }
}
