"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCachedJson } from "@/lib/use-cached-json";
import type { PathfinderData } from "@/lib/pathfinder/types";
import { assessOutcome } from "@/lib/pathfinder/core.mjs";
import dynamic from "next/dynamic";
const PathfinderMap = dynamic(() => import("./PathfinderMap").then((module) => module.PathfinderMap));
import { GoalForm } from "./GoalForm";
import { OutcomePanel, IssuePanel } from "./OutcomePanel";
import TaskDetailPanel from "@/components/TaskDetailPanel";
import { ProjectDetailPanel } from "@/components/ProjectDetailPanel";
import { GoalPad } from "./GoalPad";
import { PathfinderTimeline, type TimelineRange } from "./PathfinderTimeline";
import { QuickAdd, type AddKind } from "./QuickAdd";
import { Plus } from "lucide-react";
import { MilestonePanel } from "./MilestonePanel";

export function PathfinderBoard({
  initialGoalId = "",
}: {
  initialGoalId?: string;
}) {
  const { data, error, loading, reload, updatedAt } =
    useCachedJson<PathfinderData>("/api/pathfinder", "/api/pathfinder");
  const [timelineRange, setTimelineRange] = useState<TimelineRange>({ span: 90, offset: 0, undatedOpen: false });
  const [view, setView] = useState<"timeline" | "map">("timeline");
  const [focus, setFocus] = useState(initialGoalId);
  const [selection, setSelection] = useState<{
    kind: string;
    id: string;
  } | null>(initialGoalId ? { kind: "goal", id: initialGoalId } : null);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState<{
    kind: AddKind;
    goalId: string;
    projectId?: string;
  } | null>(null);
  const [padGoalId, setPadGoalId] = useState(initialGoalId);
  useEffect(() => {
    setFocus(initialGoalId);
    setPadGoalId(initialGoalId);
    setSelection(initialGoalId ? { kind: "goal", id: initialGoalId } : null);
  }, [initialGoalId]);
  const open = (kind: string, id: string) => {
    if (kind === "goal") setPadGoalId(id);
    setSelection({ kind, id });
  };
  const refresh = async () => {
    await reload(true);
  };
  const selectedGoal = data?.goals.find(
    (g) => selection?.kind === "goal" && g.id === selection.id,
  );
  const selectedTask = data?.tasks.find(
    (t) => selection?.kind === "task" && t.id === selection.id,
  );
  const selectedIssue = data?.issues.find(
    (i) => selection?.kind === "issue" && i.id === selection.id,
  );
  const selectedCheckpoint = data?.checkpoints.find(
    (c) => selection?.kind === "checkpoint" && c.id === selection.id,
  );
  const activeGoals = data?.goals.filter((g) => !g.data.archived) ?? [];
  const padGoal =
    activeGoals.find((g) => g.id === padGoalId) ??
    activeGoals.find((g) => g.data.status === "committed") ??
    activeGoals[0];
  const add = useCallback(
    (kind: AddKind, goalId?: string, projectId?: string) => {
      const target = goalId || padGoal?.id || "";
      if (!target) {
        setCreating(true);
        return;
      }
      setAdding({ kind, goalId: target, projectId });
    },
    [padGoal?.id],
  );
  const verified = activeGoals.filter(
    (g) =>
      data &&
      assessOutcome(g, data.observations, data.readAt).state === "achieved",
  ).length;
  return (
    <div className="folio-planning planning-workspace pathfinder-workspace">
      <header className="planning-heading">
        <div>
          <p className="compass-section-label">Your next chapter</p>
          <h1 className="compass-page-title mt-2">Pathfinder</h1>
          <p className="compass-page-subtitle">
            A clear direction. Small steps. Real progress.
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="compass-btn-secondary" href="/planning?view=records">
            Goals & notes
          </Link>
          <button
            className="compass-btn-primary"
            onClick={() => setCreating(true)}
          >
            <Plus size={15} aria-hidden="true" /> New goal
          </button>
        </div>
      </header>
      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {error}
          {data ? " Showing the last loaded snapshot; it may be stale." : ""}
          <button className="ml-3 underline" onClick={() => void reload(true)}>
            Retry
          </button>
        </div>
      )}
      {loading && !data && (
        <p role="status" className="compass-panel p-10 text-stone-500">
          Loading goals, shared work and evidence…
        </p>
      )}
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap gap-5 text-stone-600">
              <span>
                <strong className="text-stone-900">{activeGoals.length}</strong>{" "}
                outcomes
              </span>
              <span>
                <strong className="text-stone-900">{verified}</strong> verified
                achievements
              </span>
              <span>
                <strong className="text-stone-900">
                  {data.issues.filter((i) => i.status === "open").length}
                </strong>{" "}
                open findings
              </span>
            </div>
            <span className="text-xs text-stone-500">
              Read{" "}
              {new Date(updatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              ·{" "}
              <button className="underline" onClick={() => void reload(true)}>
                Refresh
              </button>
            </span>
          </div>
          <div className="pathfinder-view-toolbar">
            <div role="group" aria-label="Planning view">
              <button className={view === "timeline" ? "compass-btn-primary" : "compass-btn-secondary"} aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>Timeline</button>
              <button className={view === "map" ? "compass-btn-primary" : "compass-btn-secondary"} aria-pressed={view === "map"} onClick={() => setView("map")}>Map</button>
            </div>
            <label>Goal <select className="compass-input" value={focus} onChange={(event) => { setFocus(event.target.value); setPadGoalId(event.target.value); }}>
              <option value="">All goals</option>
              {activeGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.data.title}</option>)}
            </select></label>
          </div>
          <div className="pathfinder-workbench pathfinder-primary-workbench">
            {view === "timeline" ? <PathfinderTimeline range={timelineRange} onRangeChange={setTimelineRange} data={data} goalId={focus} onOpen={open} onAdd={() => add("checkpoint")} /> :
              <PathfinderMap data={data} goalId={focus} onFocus={setFocus} onOpen={open} onAdd={add} onCreateGoal={() => setCreating(true)} />}
            <GoalPad
              data={data}
              goal={padGoal}
              onSelect={(id) => {
                setPadGoalId(id);
                setFocus(id);
              }}
              onOpen={open}
              onEdit={() => setEditing(padGoal?.id ?? null)}
              onAdd={add}
              onCreateGoal={() => setCreating(true)}
            />
          </div>
          {adding && (
            <QuickAdd
              key={`${adding.kind}:${adding.goalId}`}
              data={data}
              goalId={adding.goalId}
              initialKind={adding.kind}
              initialProjectId={adding.projectId}
              onClose={() => setAdding(null)}
              onSaved={async () => {
                setAdding(null);
                await refresh();
              }}
            />
          )}
          {selectedGoal && (
            <OutcomePanel
              key={selectedGoal.id}
              goal={selectedGoal}
              data={data}
              onClose={() => setSelection(null)}
              onEdit={() => {
                setEditing(selectedGoal.id);
                setSelection(null);
              }}
              onFocus={() => {
                setFocus(selectedGoal.id);
                setSelection(null);
              }}
              onOpen={open}
              onChanged={refresh}
            />
          )}
          {selectedTask && (
            <TaskDetailPanel
              key={selectedTask.id}
              presentation="sheet"
              task={selectedTask}
              projectsById={Object.fromEntries(
                data.projects.map((p) => [p.id, p]),
              )}
              businessFunctionsById={Object.fromEntries(
                data.businessFunctions.map((f) => [f.id, f]),
              )}
              onClose={() => setSelection(null)}
              onChanged={refresh}
            />
          )}
          {selection?.kind === "project" && (
            <ProjectDetailPanel
              key={selection.id}
              projectId={selection.id}
              variant="modal"
              onClose={() => setSelection(null)}
              onChanged={refresh}
            />
          )}
          {selectedIssue && (
            <IssuePanel
              key={selectedIssue.id}
              issue={selectedIssue}
              tasks={data.tasks}
              onClose={() => setSelection(null)}
              onChanged={refresh}
              onOpenTask={(id) => open("task", id)}
            />
          )}
          {selectedCheckpoint && (
            <MilestonePanel
              key={selectedCheckpoint.id}
              milestone={selectedCheckpoint}
              onClose={() => setSelection(null)}
              onOpenProject={() =>
                open("project", selectedCheckpoint.project_id)
              }
              onChanged={refresh}
            />
          )}
        </>
      )}
      {(creating || editing) && (
        <GoalForm
          goal={data?.goals.find((g) => g.id === editing)}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(id) => {
            setCreating(false);
            setEditing(null);
            void refresh().then(() => open("goal", id));
          }}
        />
      )}
    </div>
  );
}
