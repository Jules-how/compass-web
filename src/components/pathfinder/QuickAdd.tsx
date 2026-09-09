"use client";
import { useRef, useState } from "react";
import {
  ArrowUpRight,
  CheckSquare2,
  Flag,
  Folder,
  Link2,
  X,
} from "lucide-react";
import type { PathfinderData, WorkType } from "@/lib/pathfinder/types";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { workFetch } from "@/lib/workspace-change";
import { pathfinderCommand } from "./OutcomePanel";

export type AddKind = "task" | "project" | "checkpoint" | "sprint" | "link";
export function QuickAdd({
  data,
  goalId,
  initialKind = "task",
  initialProjectId,
  onClose,
  onSaved,
}: {
  data: PathfinderData;
  goalId: string;
  initialKind?: AddKind;
  initialProjectId?: string;
  onClose: () => void;
  onSaved: (kind: string, id: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<AddKind>(initialKind);
  const [goal, setGoal] = useState(goalId);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [project, setProject] = useState(
    () =>
      initialProjectId ??
      data.links.find(
        (l) =>
          l.goal_id === goalId &&
          l.work_type === "project" &&
          l.state === "active",
      )?.work_id ??
      "",
  );
  const [existing, setExisting] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const created = useRef<{ kind: WorkType; id: string } | null>(null);
  const [milestoneId] = useState(() => `milestone-${crypto.randomUUID()}`);
  const options = [
    ...data.projects.map((p) => ({ kind: "project", id: p.id, title: p.name })),
    ...data.checkpoints.map((c) => ({
      kind: "checkpoint",
      id: c.id,
      title: c.title,
    })),
    ...data.tasks.map((t) => ({ kind: "task", id: t.id, title: t.title })),
    ...data.goals
      .filter((g) => !g.data.archived && g.id !== goal)
      .map((g) => ({ kind: "goal", id: g.id, title: g.data.title })),
  ].filter((r) => r.title.toLowerCase().includes(query.toLowerCase()));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || uncertain) return;
    setBusy(true);
    setError("");
    try {
      let work = created.current;
      if (!work && kind === "link") {
        const split = existing.indexOf(":");
        work = {
          kind: existing.slice(0, split) as WorkType,
          id: existing.slice(split + 1),
        };
      }
      if (!work) {
        const url =
          kind === "task"
            ? "/api/tasks"
            : kind === "project" || kind === "sprint"
              ? "/api/projects"
              : `/api/projects/${encodeURIComponent(project)}/milestones`;
        const body =
          kind === "task"
            ? {
                title,
                due: due || null,
                project_id: project || null,
                status: "not-started",
              }
            : kind === "project" || kind === "sprint"
              ? {
                  name: title,
                  target_date: due || null,
                  status: "backlog",
                  labels: kind === "sprint" ? ["sprint"] : [],
                }
              : { id: milestoneId, title, target_date: due || null };
        let response: Response;
        try {
          response = await workFetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch {
          setUncertain(kind !== "checkpoint");
          throw new Error(
            "The connection was interrupted. Check existing work before adding this again.",
          );
        }
        let result;
        try {
          result = await response.json();
        } catch {
          setUncertain(kind !== "checkpoint");
          throw new Error(
            "The response was interrupted. Check existing work before adding this again.",
          );
        }
        if (!response.ok) {
          if (response.status >= 500) setUncertain(kind !== "checkpoint");
          throw new Error(
            result.detail || result.error || "Unable to create work.",
          );
        }
        work = {
          kind: kind === "sprint" ? "project" : (kind as WorkType),
          id: result.id,
        };
        created.current = work;
      }
      const previous = data.links.find(
        (l) =>
          l.goal_id === goal &&
          l.work_id === work.id &&
          l.work_type === work.kind &&
          l.relation === "contributes",
      );
      if (previous?.state !== "active")
        await pathfinderCommand({
          action: "link",
          goal_id: goal,
          work_type: work.kind,
          work_id: work.id,
          relation: "contributes",
          state: "active",
          rationale: previous?.rationale || "",
          ...(previous ? { updated_at: previous.updated_at } : {}),
        });
      await onSaved(work.kind, work.id);
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "Unable to save."}${created.current ? " The work is saved; retry to finish connecting it." : ""}`,
      );
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || !!created.current;
  return (
    <ModalFrame
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      label="Add to your path"
      motion="dialog"
      overlayClassName="planning-dialog-overlay"
      contentClassName="planning-quick-add"
    >
      <header>
        <div>
          <p className="compass-section-label">One step closer</p>
          <h2>Add to your path</h2>
        </div>
        <button
          type="button"
          className="folio-icon-button"
          aria-label="Close quick add"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="quick-add-types" role="group" aria-label="What to add">
        {(
          [
            { key: "task", label: "Task", icon: CheckSquare2 },
            { key: "project", label: "Project", icon: Folder },
            { key: "sprint", label: "Sprint", icon: Flag },
            { key: "checkpoint", label: "Milestone", icon: Flag },
            { key: "link", label: "Link existing", icon: Link2 },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            aria-pressed={kind === key}
            disabled={locked || uncertain}
            onClick={() => setKind(key)}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <form onSubmit={save}>
        <label className="quick-add-goal">
          Towards
          <select
            required
            value={goal}
            disabled={locked}
            onChange={(e) => setGoal(e.target.value)}
          >
            <option value="">Choose a goal</option>
            {data.goals
              .filter((g) => !g.data.archived)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.data.title}
                </option>
              ))}
          </select>
        </label>
        {kind === "link" ? (
          <>
            <label className="block text-sm">
              Find existing work
              <input
                className="compass-input mt-2"
                placeholder="Search projects, milestones and tasks…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="block text-sm mt-4">
              Connect
              <select
                required
                className="compass-input mt-2"
                value={existing}
                onChange={(e) => setExisting(e.target.value)}
              >
                <option value="">Choose work…</option>
                {options.map((r) => (
                  <option key={`${r.kind}:${r.id}`} value={`${r.kind}:${r.id}`}>
                    {r.kind === "checkpoint" ? "Milestone" : r.kind} · {r.title}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="sr-only" htmlFor="quick-add-title">
              {kind === "checkpoint" ? "Milestone" : kind} title
            </label>
            <input
              data-autofocus
              id="quick-add-title"
              className="quick-add-title"
              required
              maxLength={200}
              disabled={locked}
              placeholder={
                kind === "task"
                  ? "What’s the next action?"
                  : kind === "project" || kind === "sprint"
                    ? `Give this ${kind} a name…`
                    : "What will mark progress?"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="quick-add-fields">
              <label>
                Target date <span>optional</span>
                <input
                  type="date"
                  className="compass-input mt-2"
                  value={due}
                  disabled={locked}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
              {kind !== "project" && kind !== "sprint" && (
                <label>
                  Project {kind === "task" && <span>optional</span>}
                  <select
                    className="compass-input mt-2"
                    required={kind === "checkpoint"}
                    value={project}
                    disabled={locked}
                    onChange={(e) => setProject(e.target.value)}
                  >
                    <option value="">
                      {kind === "checkpoint"
                        ? "Choose a project"
                        : "Standalone task"}
                    </option>
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {kind === "checkpoint" && !data.projects.length && (
              <p className="text-sm mt-3">
                Create a project first to give this milestone a home.
              </p>
            )}
          </>
        )}
        <p className="quick-add-hint">
          Connected work appears on your map, goal pad and timeline.
        </p>
        {error && (
          <p role="alert" className="planning-error">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            className="compass-btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="compass-btn-primary"
            disabled={busy || uncertain || !goal}
          >
            {busy
              ? "Adding…"
              : created.current
                ? "Retry connection"
                : kind === "link"
                  ? "Connect to goal"
                  : `Add ${kind === "checkpoint" ? "milestone" : kind}`}
            <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </footer>
      </form>
    </ModalFrame>
  );
}
