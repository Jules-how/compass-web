"use client";
import { useState } from "react";
import Link from "next/link";
import { useCachedJson } from "@/lib/use-cached-json";
import type { PathfinderData } from "@/lib/pathfinder/types";
import { assessOutcome } from "@/lib/pathfinder/core.mjs";
import { PathfinderMap } from "./PathfinderMap";
import { GoalForm } from "./GoalForm";
import { OutcomePanel, IssuePanel } from "./OutcomePanel";
import TaskDetailPanel from "@/components/TaskDetailPanel";
import { ProjectDetailPanel } from "@/components/ProjectDetailPanel";
import { ModalFrame } from "@/components/ui/ModalFrame";

export function PathfinderBoard({
  initialGoalId = "",
}: {
  initialGoalId?: string;
}) {
  const { data, error, loading, reload, updatedAt } =
    useCachedJson<PathfinderData>("/api/pathfinder", "/api/pathfinder");
  const [focus, setFocus] = useState(initialGoalId);
  const [selection, setSelection] = useState<{
    kind: string;
    id: string;
  } | null>(initialGoalId ? { kind: "goal", id: initialGoalId } : null);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const open = (kind: string, id: string) => setSelection({ kind, id });
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
  const verified = activeGoals.filter(
    (g) =>
      data &&
      assessOutcome(g, data.observations, data.readAt).state === "achieved",
  ).length;
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="compass-section-label">Planning / Pathfinder</p>
          <h1 className="compass-page-title mt-2">Find the path forward.</h1>
          <p className="compass-page-subtitle">
            Your outcomes, the work behind them, and the evidence that changes
            the plan.
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
            Define outcome
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
          {activeGoals.length === 0 && (
            <div className="compass-panel p-6">
              <h2 className="text-lg font-semibold">
                One meaningful outcome is enough to start.
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-stone-500">
                Define success, connect an existing project or task, then record
                the current position. Pathfinder will reveal more detail as your
                plan grows.
              </p>
              <button
                className="compass-btn-primary mt-4"
                onClick={() => setCreating(true)}
              >
                Define your first outcome
              </button>
            </div>
          )}
          <PathfinderMap
            data={data}
            goalId={focus}
            onFocus={setFocus}
            onOpen={open}
          />
          <section className="compass-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">From the daily review</h2>
                <p className="mt-1 text-xs text-stone-500">
                  The same goal-linked findings are available to your daily
                  agent and Home.
                </p>
              </div>
              <Link className="compass-btn-ghost" href="/home">
                Open Home
              </Link>
            </div>
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {data.issues
                .filter((i) => ["open", "watching"].includes(i.status))
                .slice(0, 6)
                .map((i) => (
                  <li key={i.id}>
                    <button
                      className="w-full rounded-xl bg-stone-50 p-4 text-left"
                      onClick={() => open("issue", i.id)}
                    >
                      <span className="text-xs text-stone-500">
                        {data.goals.find((g) => g.id === i.goal_id)?.data
                          .title ?? "Outcome"}{" "}
                        · {i.status}
                      </span>
                      <strong className="mt-1 block text-sm">{i.title}</strong>
                      <p className="mt-2 line-clamp-2 text-sm text-stone-600">
                        {i.next_action}
                      </p>
                    </button>
                  </li>
                ))}
            </ul>
            {!data.issues.some((i) =>
              ["open", "watching"].includes(i.status),
            ) && (
              <p className="mt-4 text-sm text-stone-500">
                No open findings yet. The daily agent can attach its next
                diagnosis or information gap to an outcome.
              </p>
            )}
          </section>
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
            <ModalFrame
              open
              onClose={() => setSelection(null)}
              label={selectedCheckpoint.title}
              overlayClassName="fixed inset-0 z-50 overflow-y-auto bg-stone-950/40 p-6 sm:p-12"
              contentClassName="compass-panel mx-auto max-w-xl p-6 outline-none"
            >
              <p className="compass-section-label">Project checkpoint</p>
              <h2 className="mt-2 text-xl font-semibold">
                {selectedCheckpoint.title}
              </h2>
              <p className="mt-4 text-sm">
                {selectedCheckpoint.description || "No checkpoint description."}
              </p>
              <p className="mt-3 text-sm text-stone-500">
                {selectedCheckpoint.completed ? "Completed" : "Incomplete"} ·
                target {selectedCheckpoint.target_date ?? "not set"}
              </p>
              <p className="mt-4 text-xs text-stone-500">
                Completing this checkpoint does not establish a business
                outcome.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  className="compass-btn-primary"
                  onClick={() => open("project", selectedCheckpoint.project_id)}
                >
                  Open project
                </button>
                <button
                  className="compass-btn-secondary"
                  onClick={() => setSelection(null)}
                >
                  Close
                </button>
              </div>
            </ModalFrame>
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
