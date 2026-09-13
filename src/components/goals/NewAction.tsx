"use client";
import { useRef, useState } from "react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { workFetch } from "@/lib/workspace-change";
import type { PlanningRow } from "@/lib/planning-server";
import type { CompassProject } from "@/lib/types";
export function NewAction({
  goal,
  projects,
  onClose,
  onSaved,
}: {
  goal: PlanningRow;
  projects: CompassProject[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(""),
    [due, setDue] = useState(""),
    [notes, setNotes] = useState(""),
    [project, setProject] = useState(""),
    [kind, setKind] = useState("SELL"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef<any>(null);
  const [key] = useState(() => `goal-action:${crypto.randomUUID()}`);
  async function save() {
    setBusy(true);
    setError("");
    try {
      pending.current ??= {
        action: "task",
        key,
        request_id: crypto.randomUUID(),
        task: {
          title,
          status: "not-started",
          due: due || null,
          project_id: project || null,
          task_type: kind,
          notes,
          source: "goals-actions",
        },
        context: {
          domain: goal.data.domain || "business",
          reason: `Contributes to ${goal.data.title}`,
          next_action: title,
          done_when:
            notes ||
            "Review and mark this action complete when its result is achieved.",
          source: "Jules added this action in Goals & actions.",
          source_kind: "explicit",
          state: "ready",
          owner: "Jules",
          goal_id: goal.id,
          campaign_id: "",
          links: [],
          depends_on: [],
          evidence: [],
        },
      };
      const r = await workFetch("/api/operating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.current),
      });
      const b = await r.json();
      if (!r.ok) {
        if (r.status < 500) pending.current = null;
        throw new Error(b.error || "Action was not saved.");
      }
      pending.current = null;
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalFrame
      open
      onClose={onClose}
      label="Add action"
      motion="dialog"
      overlayClassName="ga-overlay"
      contentClassName="ga-dialog"
    >
      <div className="ga-dialog-title">
        <h2>Add action</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <p>{goal.data.title}</p>
      <form
        className="ga-outcome-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy || Boolean(pending.current)}>
          <label>
            Action
            <input
              data-autofocus
              required
              value={title}
              maxLength={250}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="ga-form-row">
            <label>
              Day · optional
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <label>
              Project · optional
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {["SELL", "BUILD", "DELIVER", "THINK", "ADMIN"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Notes / what done looks like
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <button className="ga-primary" disabled={busy}>
          {busy
            ? "Saving…"
            : pending.current
              ? "Retry same action"
              : "Add action"}
        </button>
      </form>
    </ModalFrame>
  );
}
