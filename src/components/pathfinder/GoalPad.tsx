"use client";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Circle,
  Flag,
  Link2,
  Plus,
  Target,
} from "lucide-react";
import type { PathfinderData } from "@/lib/pathfinder/types";
import type { PlanningRow } from "@/lib/planning-server";
import { assessOutcome, executionSummary } from "@/lib/pathfinder/core.mjs";
import { goalWorkspace } from "@/lib/pathfinder/workspace.mjs";
import type { AddKind } from "./QuickAdd";

const number = (value: unknown) =>
  value == null || value === ""
    ? "Not set"
    : new Intl.NumberFormat("en-AU").format(Number(value));
const date = (value: string) =>
  new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );
export function GoalPad({
  data,
  goal,
  onSelect,
  onOpen,
  onEdit,
  onAdd,
  onCreateGoal,
}: {
  data: PathfinderData;
  goal?: PlanningRow;
  onSelect: (id: string) => void;
  onOpen: (kind: string, id: string) => void;
  onEdit: () => void;
  onAdd: (kind: AddKind) => void;
  onCreateGoal: () => void;
}) {
  const [allActions, setAllActions] = useState(false);
  const goals = data.goals.filter((g) => !g.data.archived);
  if (!goal)
    return (
      <aside className="pathfinder-goal-pad">
        <Target size={26} aria-hidden="true" />
        <h2>Start with a direction.</h2>
        <p>Choose an outcome. Then make the path towards it visible.</p>
        <button className="compass-btn-primary" onClick={onCreateGoal}>
          <Plus size={15} aria-hidden="true" />
          New goal
        </button>
      </aside>
    );
  const workspace = goalWorkspace(data, goal.id);
  const assessment = assessOutcome(goal, data.observations, data.readAt);
  const execution = executionSummary(workspace.tasks);
  const next = workspace.checkpoints
    .filter((c) => !c.completed)
    .sort((a, b) =>
      (a.target_date || "9999").localeCompare(b.target_date || "9999"),
    )[0];
  const actions = allActions
    ? workspace.actions
    : workspace.actions.slice(0, 4);
  return (
    <aside className="pathfinder-goal-pad" aria-label="Goal and next actions">
      <div className="goal-pad-label">
        <span>
          <Target size={14} aria-hidden="true" />
          Keep this in sight
        </span>
        <button
          className="folio-icon-button"
          aria-label="Edit goal and stretch target"
          onClick={onEdit}
        >
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </div>
      {goals.length > 1 && (
        <details className="goal-pad-switch">
          <summary>Switch goal</summary>
          <select
            className="goal-pad-selector"
            aria-label="Goal to focus on"
            value={goal.id}
            onChange={(e) => {
              setAllActions(false);
              onSelect(e.target.value);
            }}
          >
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.data.title}
              </option>
            ))}
          </select>
        </details>
      )}
      <h2>{goal.data.title}</h2>
      <div className="goal-pad-stretch">
        <p className="compass-section-label">Stretch goal</p>
        {goal.data.stretch != null && goal.data.stretch !== "" ? (
          <>
            <strong>{number(goal.data.stretch)}</strong>
            <span>{goal.data.unit}</span>
          </>
        ) : (
          <button className="goal-pad-add-stretch" onClick={onEdit}>
            <Plus size={16} aria-hidden="true" />
            Set your stretch target
          </button>
        )}
        <p>
          {goal.data.due
            ? `Aiming for ${date(goal.data.due)}`
            : "Choose a date to aim for"}
          {goal.data.status !== "committed" ? " · Proposed" : ""}
        </p>
      </div>
      <div className="goal-pad-measures">
        <div>
          <span>Target</span>
          <strong>
            {goal.data.measurementType === "qualitative"
              ? "Observable outcome"
              : number(goal.data.regular)}
          </strong>
        </div>
        <div>
          <span>Current</span>
          <strong>
            {assessment.observation
              ? goal.data.measurementType === "qualitative"
                ? assessment.observation.accepted
                  ? "Condition met"
                  : "Not yet"
                : number(assessment.observation.value)
              : "Unknown"}
          </strong>
        </div>
      </div>
      <p className="goal-pad-evidence">{assessment.label}</p>
      <div className="goal-pad-section-heading">
        <h3>Next actions</h3>
        <button
          className="folio-icon-button"
          aria-label="Add next action"
          onClick={() => onAdd("task")}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      <ol className="goal-pad-actions">
        {actions.map((task) => (
          <li key={task.id}>
            <button onClick={() => onOpen("task", task.id)}>
              <Circle size={15} aria-hidden="true" />
              <span>
                <strong>{task.title}</strong>
                <small>
                  {task.waiting
                    ? task.prerequisites.length
                      ? `Waiting for ${task.prerequisites.map((p) => p.name).join(", ")}`
                      : "Blocked · needs attention"
                    : task.status === "in-progress"
                      ? "In progress"
                      : "Ready to move"}
                  {task.due ? ` · ${date(task.due)}` : ""}
                </small>
              </span>
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      {workspace.actions.length > 4 && (
        <button
          className="goal-pad-more"
          onClick={() => setAllActions(!allActions)}
        >
          {allActions
            ? "Show fewer"
            : `All ${workspace.actions.length} actions`}
        </button>
      )}
      {!workspace.actions.length && (
        <p className="goal-pad-empty">
          {execution.total
            ? "The linked tasks are complete. Review the outcome or add the next step."
            : "What is the first concrete step? Add a task or connect existing work."}
        </p>
      )}
      {(goal.data.notes ||
        goal.data.criteria ||
        goal.data.metricDefinition) && (
        <details className="goal-pad-note-details">
          <summary>Goal notes</summary>
          <p className="goal-pad-note">
            {goal.data.notes ||
              goal.data.criteria ||
              goal.data.metricDefinition}
          </p>
        </details>
      )}
      <div className="goal-pad-sprints">
        <span>
          {
            workspace.projects.filter((p) => p.labels?.includes("sprint"))
              .length
          }{" "}
          sprints planned
          {goal.data.expectedSprints != null
            ? ` · ${goal.data.expectedSprints} expected`
            : ""}
        </span>
        <button onClick={() => onAdd("sprint")}>
          Add sprint <Plus size={12} aria-hidden="true" />
        </button>
      </div>
      <div className="goal-pad-section-heading">
        <h3>On the way</h3>
        <button
          className="folio-icon-button"
          aria-label="Add milestone"
          onClick={() => onAdd("checkpoint")}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      {next ? (
        <button
          className="goal-pad-milestone"
          onClick={() => onOpen("checkpoint", next.id)}
        >
          <Flag size={16} aria-hidden="true" />
          <span>
            <strong>{next.title}</strong>
            <small>
              Next milestone
              {next.target_date
                ? ` · ${date(next.target_date)}`
                : " · No date yet"}
            </small>
          </span>
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      ) : (
        <button
          className="goal-pad-empty-action"
          onClick={() => onAdd("checkpoint")}
        >
          Add a milestone to mark progress <Plus size={14} aria-hidden="true" />
        </button>
      )}
      {workspace.issues.slice(0, 2).map((issue) => (
        <button
          className="goal-pad-finding"
          key={issue.id}
          onClick={() => onOpen("issue", issue.id)}
        >
          <span>Suggested next step</span>
          <strong>{issue.next_action}</strong>
        </button>
      ))}
      <footer>
        <span>
          <Check size={13} aria-hidden="true" />
          {execution.completed} of {execution.total} tasks complete
        </span>
        <button onClick={() => onAdd("link")}>
          <Link2 size={13} aria-hidden="true" />
          Connect work
        </button>
      </footer>
    </aside>
  );
}
