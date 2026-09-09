import { requireAgentAuth } from "@/lib/agent-auth";
import { portalJson, readBoundedJson } from "@/lib/portal-http";
import {
  loadPathfinder,
  agentPathfinderContext,
  executePathfinder,
  pathfinderError,
} from "@/lib/pathfinder/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = requireAgentAuth(request);
  if (auth) return auth;
  try {
    return portalJson(
      agentPathfinderContext(
        await loadPathfinder(),
        new URL(request.url).searchParams.get("goal_id"),
      ),
    );
  } catch (e) {
    return pathfinderError(e);
  }
}
export async function POST(request: Request) {
  const auth = requireAgentAuth(request);
  if (auth) return auth;
  try {
    return portalJson({
      result: await executePathfinder(await readBoundedJson(request), "agent"),
    });
  } catch (e) {
    return pathfinderError(e);
  }
}
