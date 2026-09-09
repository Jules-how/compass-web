"use client";
import { useState } from "react";
import { Flag, X } from "lucide-react";
import type { CompassProjectMilestone } from "@/lib/types";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { NotebookEditor } from "@/components/planning/NotebookEditor";
import { workFetch } from "@/lib/workspace-change";
export function MilestonePanel({
  milestone,
  onClose,
  onOpenProject,
  onChanged,
}: {
  milestone: CompassProjectMilestone;
  onClose: () => void;
  onOpenProject: () => void;
  onChanged: () => Promise<void>;
}) {
  const [title, setTitle] = useState(milestone.title),
    [date, setDate] = useState(milestone.target_date || ""),
    [notes, setNotes] = useState(milestone.description || ""),
    [complete, setComplete] = useState(milestone.completed);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await workFetch(
        `/api/projects/${encodeURIComponent(milestone.project_id)}/milestones`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: milestone.id,
            title,
            target_date: date || null,
            description: notes || null,
            completed: complete,
            expected_updated_at: milestone.updated_at,
          }),
        },
      );
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Unable to save milestone.");
      await onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save milestone.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalFrame
      open
      onClose={onClose}
      label={`Milestone: ${milestone.title}`}
      motion="sheet"
      overlayClassName="planning-sheet-overlay"
      contentClassName="planning-task-sheet"
    >
      <header className="flex items-center justify-between">
        <p className="compass-section-label flex items-center gap-2">
          <Flag size={14} aria-hidden="true" />
          Milestone
        </p>
        <button
          className="folio-icon-button"
          aria-label="Close milestone"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <form className="mt-5 space-y-5" onSubmit={save}>
        <label className="sr-only" htmlFor="milestone-title">
          Milestone title
        </label>
        <input
          data-autofocus
          id="milestone-title"
          className="quick-add-title"
          value={title}
          maxLength={200}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs">
            Target date
            <input
              className="compass-input mt-2"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={complete}
              onChange={(e) => setComplete(e.target.checked)}
            />
            Complete
          </label>
        </div>
        <NotebookEditor
          label="Milestone notes"
          value={notes}
          onChange={setNotes}
          maxLength={10000}
          placeholder="What needs to happen? Add notes, checks and useful context…"
        />
        {error && (
          <p className="planning-error" role="alert">
            {error}
          </p>
        )}
        <footer className="flex justify-between gap-3">
          <button
            type="button"
            className="compass-btn-ghost"
            onClick={onOpenProject}
          >
            Open project
          </button>
          <button className="compass-btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save milestone"}
          </button>
        </footer>
      </form>
    </ModalFrame>
  );
}
