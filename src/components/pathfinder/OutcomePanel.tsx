"use client";
import { useMemo, useRef, useState } from "react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import {
  assessOutcome,
  supportingTasks,
  executionSummary,
} from "@/lib/pathfinder/core.mjs";
import type { PlanningRow } from "@/lib/planning-server";
import type { PathfinderData, PathfinderIssue } from "@/lib/pathfinder/types";
import { workFetch } from "@/lib/workspace-change";

export async function pathfinderCommand(command: unknown) {
  const r = await workFetch("/api/pathfinder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const b = await r.json();
  if (!r.ok) throw Object.assign(new Error(b.error || "Unable to save"),{status:r.status});
  return b.result;
}
export function OutcomePanel({
  goal,
  data,
  onClose,
  onEdit,
  onFocus,
  onOpen,
  onChanged,
}: {
  goal: PlanningRow;
  data: PathfinderData;
  onClose: () => void;
  onEdit: () => void;
  onFocus: () => void;
  onOpen: (kind: string, id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const assessment = assessOutcome(goal, data.observations, data.readAt);
  const tasks = supportingTasks(
    goal.id,
    data.links,
    data.projects,
    data.tasks,
    data.checkpoints,
  );
  const execution = executionSummary(tasks);
  const [tab, setTab] = useState("position");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [work, setWork] = useState("");
  const [rationale, setRationale] = useState("");
  const [relation, setRelation] = useState("contributes");
  const [linkState, setLinkState] = useState("active");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
  }).format(new Date());
  const [observation, setObservation] = useState({
    value: "",
    accepted: "",
    source: "",
    detail: "",
    period_start: today,
    period_end: today,
    provenance: "reported",
  });
  const [observationKey, setObservationKey] = useState(() =>
    crypto.randomUUID(),
  );
  const observationAttempt = useRef<{ fingerprint: string; at: string } | null>(
    null,
  );
  const links = data.links.filter((l) => l.goal_id === goal.id);
  const workOptions = useMemo(
    () => [
      ...data.projects.map((p) => ({
        key: `project:${p.id}`,
        label: `Project · ${p.name}`,
      })),
      ...data.tasks.map((t) => ({
        key: `task:${t.id}`,
        label: `Task · ${t.title}`,
      })),
      ...data.checkpoints.map((c) => ({
        key: `checkpoint:${c.id}`,
        label: `Checkpoint · ${c.title}`,
      })),
      ...data.goals
        .filter((g) => g.id !== goal.id && !g.data.archived)
        .map((g) => ({
          key: `goal:${g.id}`,
          label: `Outcome · ${g.data.title}`,
        })),
    ],
    [data, goal.id],
  );
  async function act(command: unknown) {
    setBusy(true);
    setError("");
    try {
      await pathfinderCommand(command);
      await onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const qualitative = goal.data.measurementType === "qualitative";
  return (
    <ModalFrame
      open
      onClose={onClose}
      label={goal.data.title}
      motion="dialog"
      overlayClassName="planning-dialog-overlay"
      contentClassName="compass-panel mx-auto max-w-3xl p-5 outline-none sm:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="compass-section-label">
            {goal.data.status === "committed"
              ? "Approved outcome"
              : "Proposed outcome"}{" "}
            · {goal.data.owner ?? "Jules"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{goal.data.title}</h2>
        </div>
        <button className="compass-btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="my-5 flex flex-wrap gap-2">
        <button className="compass-btn-secondary" onClick={onFocus}>
          Focus this outcome
        </button>
        <button className="compass-btn-secondary" onClick={onEdit}>
          Edit definition
        </button>
      </div>
      <div
        className="mb-5 flex flex-wrap gap-2"
        role="group"
        aria-label="Outcome detail views"
      >
        {["position", "work", "evidence", "history"].map((t) => (
          <button
            className={
              tab === t ? "compass-btn-primary" : "compass-btn-secondary"
            }
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            key={t}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {tab === "position" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Chosen target"
              value={
                qualitative
                  ? "Acceptance condition"
                  : `${goal.data.regular ?? "Unknown"} ${goal.data.unit ?? ""}`
              }
              detail={goal.data.due ? `By ${goal.data.due}` : "No target date"}
            />
            <Metric
              label="Current outcome"
              value={
                assessment.observation
                  ? qualitative
                    ? assessment.observation.accepted
                      ? "Condition met"
                      : "Condition not met"
                    : `${assessment.observation.value} ${goal.data.unit ?? ""}`
                  : "Unknown"
              }
              detail={assessment.label}
            />
            <Metric
              label="Supporting work"
              value={
                execution.total
                  ? `${execution.completed} / ${execution.total} complete`
                  : "No linked tasks"
              }
              detail={
                execution.blocked
                  ? `${execution.blocked} blocked`
                  : "Execution progress"
              }
            />
          </div>
          <div className="rounded-xl bg-stone-50 p-4">
            <h3 className="text-sm font-semibold">What success means</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">
              {goal.data.criteria ||
                goal.data.metricDefinition ||
                "Add a precise metric definition before treating a result as verified."}
            </p>
            <p className="mt-3 text-xs text-stone-500">{assessment.reason}</p>
          </div>
          <div className="rounded-xl border border-stone-200 p-4">
            <h3 className="text-sm font-semibold">Forecast</h3>
            <p className="mt-2 text-sm text-stone-600">
              Not available yet. A forecast needs business drivers, timing and capacity evidence.
              {assessment.estimate && <span className="mt-2 block">Current-position estimate: {assessment.estimate.value ?? (assessment.estimate.accepted ? "condition met" : "condition unmet")}. {assessment.estimate.detail}</span>}
            </p>
            <p className="mt-2 text-xs text-stone-500">
              Your target remains {goal.data.due || "undated"}. An estimate does
              not change it.
            </p>
          </div>
          {data.issues
            .filter(
              (i) =>
                i.goal_id === goal.id &&
                ["open", "watching"].includes(i.status),
            )
            .map((issue) => (
              <button
                key={issue.id}
                className="block w-full rounded-xl border border-stone-200 p-4 text-left hover:bg-stone-50"
                onClick={() => onOpen("issue", issue.id)}
              >
                <span className="text-xs text-stone-500">
                  {issue.task_id ? "Linked action" : "Recommendation"} · review{" "}
                  {issue.review_on ?? "not set"}
                </span>
                <strong className="mt-1 block text-sm">{issue.title}</strong>
                <p className="mt-2 text-sm text-stone-600">
                  {issue.next_action}
                </p>
              </button>
            ))}
          {!data.issues.some(
            (i) =>
              i.goal_id === goal.id && ["open", "watching"].includes(i.status),
          ) && (
            <p className="text-sm text-stone-500">
              No open agent findings for this outcome. The daily review can
              record a diagnosis, information gap or recommended next action
              here.
            </p>
          )}
        </div>
      )}
      {tab === "work" && (
        <div className="space-y-5">
          <p className="text-sm text-stone-500">
            Link existing work. Projects can support several outcomes. Proposed
            links do not commit work.
          </p>
          <ul className="space-y-2">
            {links.map((l) => (
              <li className="rounded-xl border border-stone-200 p-3" key={l.id}>
                <button
                  className="text-left text-sm font-medium underline decoration-stone-300 underline-offset-4"
                  onClick={() => onOpen(l.work_type, l.work_id)}
                >
                  {workOptions.find(
                    (w) => w.key === `${l.work_type}:${l.work_id}`,
                  )?.label ?? "Work no longer available"}
                </button>
                <p className="mt-1 text-xs text-stone-500">
                  {l.state === "active" ? "Active" : "Proposed"} ·{" "}
                  {l.relation === "hypothesis"
                    ? "Hypothesised effect"
                    : "Contributes to outcome"}
                </p>
                <p className="mt-2 text-sm text-stone-600">{l.rationale}</p>
                <button
                  className="compass-btn-ghost mt-2"
                  disabled={busy}
                  onClick={() =>
                    void act({
                      action: "link",
                      goal_id: l.goal_id,
                      work_type: l.work_type,
                      work_id: l.work_id,
                      relation: l.relation,
                      state: l.state === "active" ? "proposed" : "active",
                      rationale: l.rationale,
                      updated_at: l.updated_at,
                    })
                  }
                >
                  {l.state === "active" ? "Move to proposed" : "Approve link"}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="space-y-3 rounded-xl bg-stone-50 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const split = work.indexOf(":");
              void act({
                action: "link",
                goal_id: goal.id,
                work_type: work.slice(0, split),
                work_id: work.slice(split + 1),
                relation,
                state: linkState,
                rationale,
              });
            }}
          >
            <label className="block text-sm">
              Supporting work
              <select
                required
                className="compass-input mt-1 w-full"
                value={work}
                onChange={(e) => setWork(e.target.value)}
              >
                <option value="">Choose existing work</option>
                {workOptions.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Relationship
                <select
                  className="compass-input mt-1 w-full"
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                >
                  <option value="contributes">Contributes to</option>
                  <option value="hypothesis">Hypothesised to affect</option>
                </select>
              </label>
              <label className="text-sm">
                Commitment
                <select
                  className="compass-input mt-1 w-full"
                  value={linkState}
                  onChange={(e) => setLinkState(e.target.value)}
                >
                  <option value="active">Active plan</option>
                  <option value="proposed">Proposed alternative</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">
              Why this work matters
              <textarea
                className="compass-input mt-1 w-full"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
              />
            </label>
            <button disabled={busy} className="compass-btn-primary">
              Connect work
            </button>
          </form>
        </div>
      )}
      {tab === "evidence" && (
        <div className="space-y-5">
          {goal.data.actual != null && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Earlier goal entry: {goal.data.actual} {goal.data.unit}. Source:{" "}
              {goal.data.source}. Record a dated observation to use it in
              Pathfinder.
            </p>
          )}
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const fingerprint = JSON.stringify(observation);
              if (observationAttempt.current?.fingerprint !== fingerprint)
                observationAttempt.current = {
                  fingerprint,
                  at: new Date().toISOString(),
                };
              const ok = await act({
                action: "observe",
                goal_id: goal.id,
                goal_revision: goal.revision,
                idempotency_key: observationKey,
                provenance: observation.provenance,
                value: qualitative ? null : Number(observation.value),
                accepted: qualitative ? observation.accepted === "true" : null,
                source: observation.source,
                detail: observation.detail,
                period_start: observation.period_start,
                period_end: observation.period_end,
                observed_at: observationAttempt.current.at,
                evidence_ids: [],
              });
              if (ok) {
                setObservationKey(crypto.randomUUID());
                observationAttempt.current = null;
              }
            }}
          >
            <h3 className="font-semibold">Record an observation</h3>
            {qualitative ? (
              <label className="block text-sm">
                Acceptance condition
                <select
                  required
                  className="compass-input mt-1 w-full"
                  value={observation.accepted}
                  onChange={(e) =>
                    setObservation({ ...observation, accepted: e.target.value })
                  }
                >
                  <option value="">Choose a result</option>
                  <option value="true">Condition met</option>
                  <option value="false">Condition not met</option>
                </select>
              </label>
            ) : (
              <label className="block text-sm">
                Observed value · {goal.data.unit}
                <input
                  required
                  className="compass-input mt-1 w-full"
                  type="number"
                  step="any"
                  value={observation.value}
                  onChange={(e) =>
                    setObservation({ ...observation, value: e.target.value })
                  }
                />
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {(["period_start", "period_end"] as const).map((k) => (
                <label className="text-sm" key={k}>
                  {k === "period_start" ? "Period start" : "Period end"}
                  <input
                    required
                    type="date"
                    max={today}
                    className="compass-input mt-1 w-full"
                    value={observation[k]}
                    onChange={(e) =>
                      setObservation({ ...observation, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="block text-sm">
              Evidence source / deliverable
              <input
                required
                className="compass-input mt-1 w-full"
                value={observation.source}
                onChange={(e) =>
                  setObservation({ ...observation, source: e.target.value })
                }
                placeholder="Source link or identifiable record"
              />
            </label>
            <label className="block text-sm">
              Assessment
              <select
                className="compass-input mt-1 w-full"
                value={observation.provenance}
                onChange={(e) =>
                  setObservation({ ...observation, provenance: e.target.value })
                }
              >
                <option value="reported">Reported · not yet verified</option>
                <option value="measured">
                  I verified this result against the source
                </option>
                <option value="estimate">Estimate / hypothesis</option>
              </select>
            </label>
            <label className="block text-sm">
              Evidence and limitations
              <textarea
                required={observation.provenance === "measured"}
                className="compass-input mt-1 w-full"
                value={observation.detail}
                onChange={(e) =>
                  setObservation({ ...observation, detail: e.target.value })
                }
              />
            </label>
            <button disabled={busy} className="compass-btn-primary">
              Save observation
            </button>
          </form>
          <ul className="space-y-3">
            {data.observations
              .filter((o) => o.goal_id === goal.id)
              .sort((a, b) => b.observed_at.localeCompare(a.observed_at))
              .map((o) => (
                <li
                  key={o.id}
                  className="rounded-xl border border-stone-200 p-4 text-sm"
                >
                  <strong>
                    {o.value ??
                      (o.accepted ? "Condition met" : "Condition unmet")}{" "}
                    · {o.provenance}
                  </strong>
                  <p className="mt-1 text-xs text-stone-500">
                    {o.period_start} → {o.period_end} · definition{" "}
                    {o.goal_revision}
                    {o.goal_revision !== goal.revision
                      ? " · earlier definition"
                      : ""}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap">{o.source}</p>
                  <p className="mt-2 text-stone-600">{o.detail}</p>
                </li>
              ))}
          </ul>
        </div>
      )}
      {tab === "history" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Definition and decisions</h3>
          {goal.history
            .slice()
            .reverse()
            .map((h) => (
              <div
                key={h.revision}
                className="rounded-xl bg-stone-50 p-4 text-sm"
              >
                <strong>
                  Definition {h.revision} · {h.at.slice(0, 10)}
                </strong>
                <p className="mt-1">
                  {h.data.title} · target{" "}
                  {h.data.regular ?? "acceptance condition"} · {h.data.due}
                </p>
                <p className="mt-2 text-stone-600">
                  {h.data.notes || "No change rationale recorded."}
                </p>
              </div>
            ))}
          {data.activity
            .filter((a) => a.goal_id === goal.id)
            .map((a) => (
              <details
                className="rounded-xl border border-stone-200 p-4 text-sm"
                key={a.id}
              >
                <summary className="cursor-pointer">
                  {a.action
                    .replace("compass_pathfinder_", "")
                    .replace(".", " · ")}{" "}
                  · {a.actor} · {new Date(a.created_at).toLocaleString()}
                </summary>
                <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-xs text-stone-600">
                  {JSON.stringify(
                    { before: a.before_data, after: a.after_data },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))}
          <p className="text-xs text-stone-500">
            Showing the most recent workspace activity. Earlier observations and
            goal definitions remain stored.
          </p>
        </div>
      )}
    </ModalFrame>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200 p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-2 text-lg font-semibold leading-snug">{value}</p>
      <p className="mt-2 text-xs text-stone-500">{detail}</p>
    </div>
  );
}

export function IssuePanel({
  issue,
  tasks,
  onClose,
  onChanged,
  onOpenTask,
}: {
  issue: PathfinderIssue;
  tasks: PathfinderData["tasks"];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onOpenTask: (id: string) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [existingTask, setExistingTask] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const result = await pathfinderCommand({
        action: "create_task",
        issue_id: issue.id,
        ...(existingTask ? { existing_task_id: existingTask } : {}),
      });
      await onChanged();
      onOpenTask(result.task_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create task");
    } finally {
      setBusy(false);
    }
  }
  async function status(value: string) {
    setBusy(true);
    setError("");
    try {
      const { id, task_id, actor, updated_at, ...fields } = issue;
      void id;
      void task_id;
      void actor;
      void updated_at; // Server accepts only the explicit review contract.
      const keys = [
        "goal_id",
        "issue_key",
        "revision",
        "title",
        "symptom",
        "hypothesis",
        "alternatives",
        "next_action",
        "expected_benefit",
        "effort_minutes",
        "uncertainty",
        "prerequisites",
        "opportunity_cost",
        "review_on",
        "source",
        "evidence_ids",
      ];
      await pathfinderCommand({
        action: "review",
        ...Object.fromEntries(keys.map((k) => [k, (fields as any)[k]])),
        status: value,
      });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalFrame
      open
      onClose={onClose}
      label={issue.title}
      overlayClassName="fixed inset-0 z-50 overflow-y-auto bg-stone-950/40 p-4 sm:p-10"
      contentClassName="compass-panel mx-auto max-w-2xl p-6 outline-none"
    >
      <div className="flex justify-between gap-3">
        <h2 className="text-xl font-semibold">{issue.title}</h2>
        <button className="compass-btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="my-3 text-xs text-stone-500">
        {issue.status} · review {issue.review_on ?? "not set"} · {issue.actor}
      </p>
      <dl className="space-y-4">
        {[
          ["Observed symptom", issue.symptom],
          ["Suspected cause", issue.hypothesis],
          ["Alternative explanations", issue.alternatives],
          ["Next action", issue.next_action],
          ["Expected benefit", issue.expected_benefit],
          [
            "Effort",
            issue.effort_minutes == null
              ? "Unknown"
              : `${issue.effort_minutes} human minutes`,
          ],
          ["Uncertainty", issue.uncertainty],
          ["Prerequisites", issue.prerequisites],
          ["Opportunity cost / work to pause", issue.opportunity_cost],
          ["Source", issue.source],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium text-stone-500">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm">
              {value || "Not established"}
            </dd>
          </div>
        ))}
      </dl>
      {error && (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="mt-6">
        {!issue.task_id && (
          <label className="block text-sm">
            Check existing work first
            <select
              className="compass-input mt-2 w-full"
              value={existingTask}
              onChange={(e) => setExistingTask(e.target.value)}
            >
              <option value="">Create a new task for this finding</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} · {t.status}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {issue.task_id ? (
          <button
            className="compass-btn-primary"
            onClick={() => onOpenTask(issue.task_id!)}
          >
            Open existing task
          </button>
        ) : (
          <button
            className="compass-btn-primary"
            disabled={busy || !["open", "watching"].includes(issue.status)}
            onClick={() => void create()}
          >
            {existingTask ? "Use existing task" : "Create linked task"}
          </button>
        )}
        <button
          className="compass-btn-secondary"
          disabled={busy}
          onClick={() => void status("watching")}
        >
          Keep watching
        </button>
        <button
          className="compass-btn-ghost"
          disabled={busy}
          onClick={() => void status("dismissed")}
        >
          Dismiss
        </button>
        <button
          className="compass-btn-ghost"
          disabled={busy}
          onClick={() => void status("resolved")}
        >
          Resolve finding
        </button>
      </div>
      <p className="mt-3 text-xs text-stone-500">
        Creating a task authorises no spend, messages or external commitments.
        Resolving a finding does not complete its task or achieve the outcome.
      </p>
    </ModalFrame>
  );
}
