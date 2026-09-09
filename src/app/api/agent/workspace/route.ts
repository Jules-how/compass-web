import { requireAgentAuth } from "@/lib/agent-auth";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { portalJson } from "@/lib/portal-http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = requireAgentAuth(request);
  if (auth) return auth;
  const q = new URL(request.url).searchParams;
  const page = Number(q.get("page") || 0);
  if (!Number.isInteger(page) || page < 0)
    return portalJson({ error: "invalid_page" }, { status: 400 });
  const db = getPortalAdminClient();
  const [projects, tasks, clients] = await Promise.all([
    db
      .from("compass_projects")
      .select("id,name,status,summary,priority,target_date,client_id,notes", {
        count: "exact",
      })
      .order("id")
      .range(page * 100, page * 100 + 99),
    db
      .from("compass_tasks")
      .select(
        "id,title,status,project_id,due,task_type,notes,execution_level",
        { count: "exact" },
      )
      .neq("status", "done")
      .neq("status", "completed")
      .neq("status", "cancelled")
      .order("id")
      .range(page * 100, page * 100 + 99),
    db
      .from("compass_clients")
      .select("id,name,status", { count: "exact" })
      .is("archived_at", null)
      .order("id")
      .range(page * 100, page * 100 + 99),
  ]);
  if (projects.error || tasks.error || clients.error)
    return portalJson(
      {
        error: "workspace_unavailable",
        details: [
          projects.error?.message,
          tasks.error?.message,
          clients.error?.message,
        ].filter(Boolean),
      },
      { status: 503 },
    );
  return portalJson({
    ok: true,
    readAt: new Date().toISOString(),
    page,
    projects: projects.data,
    tasks: tasks.data,
    clients: clients.data,
    totals: {
      projects: projects.count,
      tasks: tasks.count,
      clients: clients.count,
    },
    hasMore: [projects.count, tasks.count, clients.count].some(
      (n) => (n || 0) > (page + 1) * 100,
    ),
  });
}
