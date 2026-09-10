"use client";
import { useState } from "react";
import type { PlanningRow } from "@/lib/planning-server";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { workFetch } from "@/lib/workspace-change";
export function GoalForm({
  goal,
  onClose,
  onSaved,
}: {
  goal?: PlanningRow;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState<Record<string, any>>(
    goal?.data ?? {
      title: "",
      period: "quarterly",
      regular: "",
      stretch: "",
      baseline: "",
      due: "",
      unit: "",
      source: "",
      measurementType: "quantitative",
      direction: "increase",
      criteria: "",
      metricDefinition: "",
      owner: "Jules",
      currency: "AUD",
      freshnessDays: 30,
      status: "draft",
    },
  );
  const [id] = useState(
    () => goal?.id ?? `planning.goal.${crypto.randomUUID()}`,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: unknown) =>
    setForm({ ...form, [key]: value });
  const numeric = form.measurementType !== "qualitative";
  const committed = form.status === "committed";
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await workFetch("/api/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "goal",
          id,
          revision: goal?.revision,
          data: form,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      onSaved(b.record.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  const field = (
    key: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label className="block text-sm" key={key}>
      {label}
      <input
        className="compass-input mt-1 w-full"
        data-autofocus={key === "title" ? true : undefined}
        type={type}
        step={type === "number" ? "any" : undefined}
        value={form[key] ?? ""}
        required={required}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  return (
    <ModalFrame
      open
      onClose={onClose}
      label={goal ? "Edit outcome definition" : "Define an outcome"}
      motion="dialog"
      overlayClassName="fixed inset-0 z-[70] overflow-y-auto bg-stone-950/40 p-4 sm:p-10"
      contentClassName="compass-panel mx-auto max-w-2xl p-6 outline-none"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {goal ? "Edit outcome definition" : "Define an outcome"}
        </h2>
        <button className="compass-btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="mb-5 text-sm text-stone-500">
        Choose what success means. Supporting tasks track execution separately.
        Changing the definition requires a fresh observation.
      </p>
      <form onSubmit={save} className="space-y-4">
        {field("title", "Outcome", "text", true)}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Measure
            <select
              className="compass-input mt-1 w-full"
              value={form.measurementType ?? "quantitative"}
              onChange={(e) => set("measurementType", e.target.value)}
            >
              <option value="quantitative">Numeric target</option>
              <option value="qualitative">
                Observable acceptance condition
              </option>
            </select>
          </label>
          {field("owner", "Owner", "text", true)}
          <label className="text-sm">Area<select className="compass-input mt-1 w-full" value={form.domain || "business"} onChange={e => set("domain", e.target.value)}><option value="business">Business</option><option value="personal">Personal</option></select></label>
          {field("due", "Chosen target date", "date", committed)}
          <label className="text-sm">
            Horizon
            <select
              className="compass-input mt-1 w-full"
              value={form.period}
              onChange={(e) => set("period", e.target.value)}
            >
              {["daily", "weekly", "monthly", "quarterly", "yearly"].map(
                (p) => (
                  <option key={p}>{p}</option>
                ),
              )}
            </select>
          </label>
          {numeric && (
            <>
              <label className="text-sm">
                Direction
                <select
                  className="compass-input mt-1 w-full"
                  value={form.direction ?? "increase"}
                  onChange={(e) => set("direction", e.target.value)}
                >
                  <option value="increase">At least the target</option>
                  <option value="decrease">At most the target</option>
                </select>
              </label>
              {field(
                "unit",
                "Unit / period (for example, AUD MRR)",
                "text",
                committed,
              )}
              {field("baseline", "Baseline · blank if unknown", "number")}
              {field("regular", "Target", "number", committed)}
              {field("stretch", "Stretch · optional", "number")}
              {field("currency", "Currency · financial measures only")}
            </>
          )}
        </div>
        <label className="block text-sm">
          {numeric
            ? "Metric definition and inclusion rules"
            : "Observable acceptance condition"}
          <textarea
            required={committed}
            className="compass-input mt-1 min-h-24 w-full"
            value={form[numeric ? "metricDefinition" : "criteria"] ?? ""}
            onChange={(e) =>
              set(numeric ? "metricDefinition" : "criteria", e.target.value)
            }
            placeholder={
              numeric
                ? "Define what is counted, over which period, and what is excluded."
                : "What observable result would demonstrate success?"
            }
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "expectedSprints",
            "Expected sprints · optional planning estimate",
            "number",
          )}
          {field(
            "freshnessDays",
            "Refresh evidence after this many days",
            "number",
            true,
          )}
          <label className="text-sm">
            Decision
            <select
              className="compass-input mt-1 w-full"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="draft">Proposed outcome</option>
              <option value="committed">Approve this outcome</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">
          Rationale / reason for change
          <textarea
            className="compass-input mt-1 w-full"
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button className="compass-btn-primary" disabled={busy}>
          {busy
            ? "Saving…"
            : form.status === "committed"
              ? "Save approved outcome"
              : "Save proposed outcome"}
        </button>
      </form>
    </ModalFrame>
  );
}
