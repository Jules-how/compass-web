"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useActivePane } from "@/components/ActivePane";
import { GoalForm } from "@/components/pathfinder/GoalForm";
import { QuickAdd, type AddKind } from "@/components/pathfinder/QuickAdd";
import { OutcomePanel } from "@/components/pathfinder/OutcomePanel";
import TaskDetailPanel from "@/components/TaskDetailPanel";
import { RichNotebook } from "./RichNotebook";
import { CallSession, NewSession } from "./CallSession";
import { NewAction } from "./NewAction";
import { PaymentEvidence } from "./PaymentEvidence";
import { goalWorkspace } from "@/lib/pathfinder/workspace.mjs";
import { assessOutcome } from "@/lib/pathfinder/core.mjs";
import {
  goalMeasures,
  localDay,
  weekDays,
  taskDay,
  type GoalSession,
} from "@/lib/goal-actions";
import { onWorkChanged } from "@/lib/workspace-change";
import type { PathfinderData } from "@/lib/pathfinder/types";
import type { PlanningRow } from "@/lib/planning-server";
import type { CompassTask } from "@/lib/types";
import "./goals.css";
type Data = PathfinderData & {
  sessions: GoalSession[];
  connections?: { codex_local: string; chatgpt: string; chatgpt_work: string };
};
export async function readJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error || "Unable to load Compass.");
  return b;
}
export function GoalsActions({ initialGoalId }: { initialGoalId?: string }) {
  const active = useActivePane();
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [goalId, setGoalId] = useState(initialGoalId || ""),
    [tab, setTab] = useState("Actions");
  const [period, setPeriod] = useState("Week"),
    [group, setGroup] = useState("Days"),
    [anchor, setAnchor] = useState(() => localDay(new Date()));
  const [goalForm, setGoalForm] = useState<PlanningRow | "new" | null>(null),
    [add, setAdd] = useState<AddKind | null>(null),
    [task, setTask] = useState<CompassTask | null>(null),
    [newSession, setNewSession] = useState(false),
    [sessionId, setSessionId] = useState(""),
    [outcome, setOutcome] = useState(false);
  const [evidence, setEvidence] = useState<any>(null),
    [campaigns, setCampaigns] = useState<any>(null),
    [secondaryError, setSecondaryError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const d = await readJson("/api/goals/actions");
      setData(d);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to refresh.");
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    void refresh();
    const cleanup = onWorkChanged(() => void refresh());
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => {
      cleanup();
      clearInterval(interval);
    };
  }, [active, refresh]);
  const goals = data?.goals.filter((g) => !g.data.archived) || [];
  const goal = goals.find((g) => g.id === goalId) || goals[0];
  useEffect(() => {
    if (!goal || !active) return;
    let live = true;
    readJson(
      `/api/goals/actions?section=evidence&goal=${encodeURIComponent(goal.id)}`,
    )
      .then((d) => {
        if (live) {
          setEvidence(d);
          setSecondaryError("");
        }
      })
      .catch((e) => {
        if (live) {
          setEvidence(null);
          setSecondaryError(e.message);
        }
      });
    return () => {
      live = false;
    };
  }, [goal, data?.readAt, active]);
  useEffect(() => {
    if (tab !== "Week & campaigns") return;
    readJson("/api/outbound/overview")
      .then(setCampaigns)
      .catch((e) => setSecondaryError(e.message));
  }, [tab, data?.readAt]);
  const workspace = useMemo(
    () => (data && goal ? goalWorkspace(data, goal.id) : null),
    [data, goal],
  );
  const days =
    period === "Today"
      ? [localDay(new Date())]
      : period === "Month"
        ? Array.from(
            {
              length: new Date(
                Number(anchor.slice(0, 4)),
                Number(anchor.slice(5, 7)),
                0,
              ).getDate(),
            },
            (_, i) => `${anchor.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`,
          )
        : weekDays(anchor);
  const first = days[0],
    last = days[days.length - 1];
  const measures = goalMeasures(
    data?.observations.filter((o) => o.goal_id === goal?.id) || [],
    evidence?.touches || [],
    first,
    last,
  );
  const assessment =
    goal && data ? assessOutcome(goal, data.observations, data.readAt) : null;
  if (!data)
    return (
      <div className="ga-loading" role={error ? "alert" : "status"}>
        {error || "Loading goals and actions…"}
        {error && <button onClick={() => void refresh()}>Retry</button>}
      </div>
    );
  const chooseGoal = (id: string) => {
    setGoalId(id);
    setSessionId("");
    setEvidence(null);
    window.history.replaceState(
      null,
      "",
      `/planning?goal=${encodeURIComponent(id)}`,
    );
  };
  const openTasks =
    workspace?.tasks.filter(
      (t) => !t.parent_task_id && !["cancelled"].includes(t.status),
    ) || [];
  const inPeriod = (t: CompassTask) => {
    const d = taskDay(t);
    return d && d >= first && d <= last;
  };
  const columns =
    group === "Status"
      ? ["not-started", "in-progress", "blocked", "completed"].map(
          (status) => ({
            id: status,
            title: (
              {
                "not-started": "To do",
                "in-progress": "In progress",
                blocked: "Blocked",
                completed: "Done",
              } as any
            )[status],
            tasks: openTasks.filter(
              (t) => t.status === status && (inPeriod(t) || !t.due),
            ),
          }),
        )
      : days.map((d) => ({
          id: d,
          title: new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", {
            weekday: "short",
            day: "numeric",
            month: period === "Month" ? "short" : undefined,
          }),
          tasks: openTasks.filter((t) => taskDay(t) === d),
        }));
  const unscheduled = openTasks.filter(
      (t) => !t.due && t.status !== "completed",
    ),
    overdue = openTasks.filter(
      (t) => t.due && taskDay(t) < first && t.status !== "completed",
    );
  const session = data.sessions.find((s) => s.id === sessionId);
  const saved = async () => {
    await refresh();
  };
  return (
    <section className="ga-workspace" aria-label="Goals and actions">
      <header className="ga-header">
        <div>
          <label className="ga-goal-picker">
            Goals{" "}
            <select
              aria-label="Choose goal"
              value={goal?.id || ""}
              onChange={(e) => chooseGoal(e.target.value)}
            >
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.data.title}
                </option>
              ))}
            </select>
          </label>
          <h1>{goal?.data.title || "Goals & actions"}</h1>
        </div>
        <div className="ga-buttons">
          <button onClick={() => setGoalForm("new")}>New goal</button>
          {goal && (
            <button className="ga-primary" onClick={() => setAdd("task")}>
              + Add action
            </button>
          )}
        </div>
      </header>
      {error && (
        <div className="ga-notice" role="alert">
          {error} Showing the last loaded view.{" "}
          <button onClick={() => void refresh()}>Refresh</button>
        </div>
      )}
      {!goal ? (
        <div className="ga-empty">
          <h2>Choose the result you want to work towards.</h2>
          <p>
            Create a goal, write its hypothesis, then add actions or link
            existing work.
          </p>
          <button onClick={() => setGoalForm("new")}>Create a goal</button>
        </div>
      ) : (
        <>
          {goal.data.measuresProfile === "sales_validation" ? (
            <div
              className="ga-metrics"
              aria-label="Results for the selected period"
            >
              <div>
                <span>Paid customers</span>
                <b>{measures.paid ?? "—"}</b>
              </div>
              <div>
                <span>Positive conversations</span>
                <b>{evidence ? measures.positive : "—"}</b>
              </div>
              <div>
                <span>Sales conversations</span>
                <b>{evidence ? measures.conversations : "—"}</b>
              </div>
              <div>
                <span>Market coverage</span>
                <b>{evidence ? `${measures.coverage} reached` : "—"}</b>
              </div>
            </div>
          ) : (
            <div className="ga-metrics" aria-label="Goal result and work">
              <div>
                <span>Result</span>
                <b>
                  {assessment?.observation?.value ??
                    assessment?.label ??
                    "Unknown"}
                </b>
              </div>
              <div>
                <span>Target</span>
                <b>{goal.data.regular ?? "Acceptance condition"}</b>
              </div>
              <div>
                <span>Actions done</span>
                <b>
                  {openTasks.filter((t) => t.status === "completed").length}
                </b>
              </div>
              <div>
                <span>Actions open</span>
                <b>
                  {openTasks.filter((t) => t.status !== "completed").length}
                </b>
              </div>
            </div>
          )}
          <div className="ga-controls">
            <nav aria-label="Goal views">
              {["Actions", "Goal notebook", "Week & campaigns", "Evidence"].map(
                (t) => (
                  <button
                    key={t}
                    aria-current={tab === t ? "page" : undefined}
                    onClick={() => {
                      setTab(t);
                      setSessionId("");
                    }}
                  >
                    {t}
                  </button>
                ),
              )}
            </nav>
            <div className="ga-switches">
              {["Today", "Week", "Month"].map((p) => (
                <button
                  key={p}
                  aria-pressed={period === p}
                  onClick={() => {
                    setPeriod(p);
                    if (p === "Today") setAnchor(localDay(new Date()));
                  }}
                >
                  {p}
                </button>
              ))}
              <select
                aria-label="Group actions"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                <option>Days</option>
                <option>Status</option>
              </select>
              <input
                aria-label="Choose period"
                type="date"
                value={anchor}
                onChange={(e) => {
                  if (e.target.value) {
                    setAnchor(e.target.value);
                    if (period === "Today") setPeriod("Week");
                  }
                }}
              />
            </div>
          </div>
          <div className="ga-body">
            <div className="ga-main" tabIndex={0} aria-label="Goal workspace">
              {secondaryError && (
                <p className="ga-notice" role="alert">
                  {secondaryError}
                </p>
              )}
              {tab === "Goal notebook" && (
                <div className="ga-paper">
                  <RichNotebook
                    subject={{ kind: "goal", id: goal.id }}
                    tasks={workspace?.tasks}
                  />
                </div>
              )}
              {tab === "Actions" &&
                (session ? (
                  <CallSession
                    key={session.id}
                    session={session}
                    onBack={() => setSessionId("")}
                    onChanged={saved}
                  />
                ) : (
                  <>
                    <div className="ga-board-tools">
                      <span>
                        {first} – {last}
                      </span>
                      <button onClick={() => setNewSession(true)}>
                        + City calling session
                      </button>
                      <button onClick={() => setAdd("project")}>Project</button>
                      <button onClick={() => setAdd("checkpoint")}>
                        Milestone
                      </button>
                      <button onClick={() => setAdd("link")}>
                        Link existing work
                      </button>
                    </div>
                    {(overdue.length > 0 || unscheduled.length > 0) && (
                      <div className="ga-backlog">
                        {[
                          { label: "Overdue / earlier", tasks: overdue },
                          { label: "Not scheduled", tasks: unscheduled },
                        ]
                          .filter((g) => g.tasks.length)
                          .map((g) => (
                            <details key={g.label}>
                              <summary>
                                {g.label} · {g.tasks.length}
                              </summary>
                              <div className="ga-backlog-cards">
                                {g.tasks.map((t) => (
                                  <ActionCard
                                    key={t.id}
                                    task={t}
                                    sessions={data.sessions}
                                    onTask={setTask}
                                    onSession={setSessionId}
                                  />
                                ))}
                              </div>
                            </details>
                          ))}
                      </div>
                    )}
                    <div
                      className={`ga-board ${period === "Month" ? "ga-month" : ""}`}
                    >
                      {columns.map((c) => (
                        <section key={c.id} className="ga-column">
                          <h2>
                            {c.title}
                            <span>{c.tasks.length}</span>
                          </h2>
                          {c.tasks.map((t) => (
                            <ActionCard
                              key={t.id}
                              task={t}
                              sessions={data.sessions}
                              onTask={setTask}
                              onSession={setSessionId}
                            />
                          ))}
                          {!c.tasks.length && (
                            <p className="ga-empty-day">No actions scheduled</p>
                          )}
                        </section>
                      ))}
                    </div>
                    {workspace &&
                      (workspace.projects.length > 0 ||
                        workspace.checkpoints.length > 0) && (
                        <div className="ga-linked">
                          <h2>Projects & milestones</h2>
                          {workspace.projects.map((p) => (
                            <a
                              key={p.id}
                              href={`/projects?project=${encodeURIComponent(p.id)}`}
                            >
                              {p.name} · {p.status}
                            </a>
                          ))}
                          {workspace.checkpoints.map((c) => (
                            <a
                              key={c.id}
                              href={`/planning?view=pathfinder&goal=${goal.id}`}
                            >
                              {c.completed ? "✓ " : ""}
                              {c.title} · {c.target_date || "Not scheduled"}
                            </a>
                          ))}
                        </div>
                      )}
                  </>
                ))}
              {tab === "Week & campaigns" && (
                <div className="ga-paper">
                  <h2>Campaign sequence</h2>
                  <p className="ga-muted">
                    Provider status and recorded activity. A planned campaign is
                    not a confirmed send.
                  </p>
                  {!campaigns ? (
                    <p role="status">Loading campaigns…</p>
                  ) : (
                    <>
                      {campaigns.campaigns?.map((c: any) => (
                        <a
                          className="ga-campaign"
                          href={`/sales/outbound?campaign=${encodeURIComponent(c.id)}`}
                          key={c.id}
                        >
                          <strong>{c.name}</strong>
                          <span>
                            {c.provider_status || "Provider status unknown"} ·{" "}
                            {c.freshness || "Freshness unknown"}
                          </span>
                          <small>
                            {c.location_tags?.join(", ")} ·{" "}
                            {c.prepared_count ?? "—"} prepared ·{" "}
                            {c.provider?.loaded ??
                              c.loaded_receipt_count ??
                              "—"}{" "}
                            confirmed loaded
                          </small>
                          <small>
                            {c.provider?.sent ?? "—"} sent ·{" "}
                            {c.provider?.replies ?? "—"} replies · Checked{" "}
                            {c.provider?.observed_at
                              ? new Date(c.provider.observed_at).toLocaleString(
                                  "en-AU",
                                )
                              : "unknown"}
                          </small>
                          {c.refresh_error && <small>{c.refresh_error}</small>}
                        </a>
                      ))}
                      <p>
                        {campaigns.activity?.message ||
                          "Open a campaign for its recorded send times and sequence."}
                      </p>
                    </>
                  )}
                </div>
              )}
              {tab === "Evidence" && (
                <div className="ga-paper">
                  {goal.data.measuresProfile === "sales_validation" && (
                    <PaymentEvidence
                      goal={goal}
                      observations={data.observations.filter(
                        (o) => o.goal_id === goal.id,
                      )}
                      onChanged={saved}
                    />
                  )}
                  <h2>Conversation evidence</h2>
                  <p>
                    {evidence?.scope || "Conversation history unavailable."}{" "}
                    {evidence?.complete === false
                      ? "Only the first 5,000 events are loaded."
                      : ""}
                  </p>
                  {evidence?.touches
                    .filter(
                      (t: any) =>
                        localDay(t.contacted_at) >= first &&
                        localDay(t.contacted_at) <= last,
                    )
                    .map((t: any) => (
                      <a
                        className="ga-evidence-row"
                        key={t.id}
                        href={`/sales/outbound/rhythm?lead=${encodeURIComponent(t.contact_id)}`}
                      >
                        <strong>{t.company || t.contact_id}</strong>
                        <span>
                          {t.outcome.replaceAll("_", " ")} ·{" "}
                          {new Date(t.contacted_at).toLocaleString("en-AU")}
                        </span>
                        {t.request_payload?.signals?.length > 0 && (
                          <small>{t.request_payload.signals.join(", ")}</small>
                        )}
                      </a>
                    ))}
                </div>
              )}
            </div>
            <aside
              className="ga-objective"
              tabIndex={0}
              aria-label="Primary objective"
            >
              <div className="ga-rail-title">
                <h2>Primary objective</h2>
                <button onClick={() => setGoalForm(goal)}>Edit</button>
              </div>
              <h3>{goal.data.title}</h3>
              <span className="ga-badge">
                {goal.data.status === "committed" ? "Approved" : "Proposed"}
              </span>
              <p>
                {goal.data.metricDefinition ||
                  goal.data.criteria ||
                  "Define success in the goal editor."}
              </p>
              <dl>
                <dt>Target</dt>
                <dd>
                  {goal.data.regular || "—"} {goal.data.unit || ""}
                </dd>
                <dt>Target date</dt>
                <dd>{goal.data.due || "Not set"}</dd>
                <dt>Outcome evidence</dt>
                <dd>{assessment?.label}</dd>
              </dl>
              <button onClick={() => setOutcome(true)}>
                Review primary result
              </button>
              <hr />
              {goal.data.measuresProfile === "sales_validation" ? (
                <>
                  <h3>What the four measures mean</h3>
                  <p>
                    <b>Paid customers</b> · clients with at least A$2,500 in
                    recorded receipts in this period. Signed or invoiced work
                    does not count. Refunds are shown separately.
                  </p>
                  <p>
                    <b>Positive conversations</b> · a recorded sales
                    conversation with value, demand, progress or a meeting
                    signal.
                  </p>
                  <p>
                    <b>Sales conversations</b> · manually confirmed
                    conversations, including those without a positive signal.
                  </p>
                  <p>
                    <b>Market coverage</b> · distinct businesses reached in
                    recorded goal activity. The total eligible market is unknown
                    until a cohort is defined.
                  </p>
                  <p className="ga-muted">
                    Counts cover {first} to {last}. A zero means no matching
                    recorded events, not a claim of complete external history.
                  </p>
                </>
              ) : (
                <p>
                  Result uses evidence recorded against the current goal
                  definition. Completing actions does not automatically
                  establish that the goal was achieved.
                </p>
              )}
              <hr />
              <h3>Chat connection</h3>
              <p>
                Codex local: {data.connections?.codex_local || "Unknown"}.
                ChatGPT and ChatGPT Work:{" "}
                {data.connections?.chatgpt_work || "Unknown"}.
              </p>
              <p className="ga-muted">
                Explicit instructions use the connected adapter. Inferred
                changes remain proposals.
              </p>
              <hr />
              <button onClick={() => setTab("Goal notebook")}>
                Open goal notebook
              </button>
              <a href={`/planning?view=pathfinder&goal=${goal.id}`}>
                Open Pathfinder map
              </a>
              <a href="/planning?view=records">All planning records</a>
            </aside>
          </div>
        </>
      )}
      {goalForm && (
        <GoalForm
          goal={goalForm === "new" ? undefined : goalForm}
          onClose={() => setGoalForm(null)}
          onSaved={(id) => {
            setGoalForm(null);
            chooseGoal(id);
            void refresh();
          }}
        />
      )}
      {add === "task" && goal && (
        <NewAction
          goal={goal}
          projects={data.projects}
          onClose={() => setAdd(null)}
          onSaved={async () => {
            setAdd(null);
            await refresh();
          }}
        />
      )}
      {add && add !== "task" && goal && (
        <QuickAdd
          data={data}
          goalId={goal.id}
          initialKind={add}
          onClose={() => setAdd(null)}
          onSaved={async () => {
            setAdd(null);
            await refresh();
          }}
        />
      )}
      {task && (
        <TaskDetailPanel
          task={task}
          projectsById={Object.fromEntries(data.projects.map((p) => [p.id, p]))}
          businessFunctionsById={Object.fromEntries(
            data.businessFunctions.map((p) => [p.id, p]),
          )}
          onClose={() => setTask(null)}
          onChanged={() => void refresh()}
        />
      )}
      {newSession && goal && (
        <NewSession
          goalId={goal.id}
          onClose={() => setNewSession(false)}
          onSaved={async (id) => {
            setNewSession(false);
            await refresh();
            setSessionId(id);
          }}
        />
      )}
      {outcome && goal && (
        <OutcomePanel
          goal={goal}
          data={data}
          onClose={() => setOutcome(false)}
          onEdit={() => {
            setOutcome(false);
            setGoalForm(goal);
          }}
          onFocus={() => setOutcome(false)}
          onOpen={(kind, id) => {
            setOutcome(false);
            if (kind === "task")
              setTask(data.tasks.find((t) => t.id === id) || null);
            else
              window.location.assign(
                `/planning?view=pathfinder&goal=${goal.id}`,
              );
          }}
          onChanged={saved}
        />
      )}
    </section>
  );
}
function ActionCard({
  task,
  sessions,
  onTask,
  onSession,
}: {
  task: CompassTask;
  sessions: GoalSession[];
  onTask: (t: CompassTask) => void;
  onSession: (id: string) => void;
}) {
  const session = sessions.find((s) => s.data.task_id === task.id);
  return (
    <article
      className={`ga-card ${task.status === "completed" ? "ga-completed" : ""}`}
    >
      <button
        className="ga-card-open"
        onClick={() => (session ? onSession(session.id) : onTask(task))}
      >
        <span className="ga-card-kind">
          {session ? "Calling session" : task.task_type || "Action"}
          {task.outreach_state === "unresolved"
            ? " · Date / next step unresolved"
            : ""}
        </span>
        <strong>{task.title}</strong>
        <span className="ga-card-meta">
          {task.status.replaceAll("-", " ")}
          {session
            ? ` · ${session.data.handled_ids?.length || 0}/${session.data.lead_ids.length} outcomes`
            : ""}
        </span>
      </button>
      {session && (
        <button className="ga-card-edit" onClick={() => onTask(task)}>
          Edit task
        </button>
      )}
    </article>
  );
}
