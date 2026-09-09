"use client";
import type { Recipe, SignalRule } from "@/lib/outbound-preparation";
const input = "compass-input mt-1 w-full";
export function SignalRecipeEditor({
  recipe,
  onChange,
}: {
  recipe: Recipe;
  onChange: (r: Recipe) => void;
}) {
  const rules = recipe.rules ?? [];
  const update = (i: number, changes: Partial<SignalRule>) =>
    onChange({
      ...recipe,
      rules: rules.map((r, j) => (i === j ? { ...r, ...changes } : r)),
    });
  const move = (i: number, delta: number) => {
    const next = [...rules];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    onChange({ ...recipe, rules: next });
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        Rules run from top to bottom. The first matching published signal
        selects the opener. You write the wording; the list supplies the facts.
        Edit both complete emails in this campaign’s Copy section.
      </p>
      {rules.map((r, i) => (
        <fieldset
          key={r.id}
          className="rounded-xl border border-stone-200 p-3 space-y-3"
        >
          <legend className="px-1 text-sm font-medium">
            {i + 1}. {r.label || "New signal"}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              Signal label
              <input
                required
                maxLength={100}
                className={input}
                value={r.label}
                onChange={(e) => update(i, { label: e.target.value })}
              />
            </label>
            <label className="text-xs">
              Evidence field
              <input
                required
                pattern="[a-z][a-z0-9_]{0,49}"
                className={input}
                value={r.field}
                onChange={(e) => update(i, { field: e.target.value })}
              />
            </label>
          </div>
          <label className="block text-xs">
            Value contains (optional)
            <input
              maxLength={200}
              className={input}
              value={r.contains ?? ""}
              placeholder="Leave blank to match any valid evidence in this field"
              onChange={(e) => update(i, { contains: e.target.value })}
            />
          </label>
          <label className="block text-xs">
            Opener for this signal
            <textarea
              required
              rows={3}
              maxLength={500}
              className={input}
              value={r.opener}
              onChange={(e) => update(i, { opener: e.target.value })}
            />
          </label>
          <label className="block text-xs">
            Subject override (optional)
            <input
              maxLength={200}
              className={input}
              value={r.subject ?? ""}
              onChange={(e) => update(i, { subject: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={i === 0}
              className="compass-btn-secondary"
              onClick={() => move(i, -1)}
              aria-label={`Move ${r.label} earlier`}
            >
              Move up
            </button>
            <button
              type="button"
              disabled={i === rules.length - 1}
              className="compass-btn-secondary"
              onClick={() => move(i, 1)}
              aria-label={`Move ${r.label} later`}
            >
              Move down
            </button>
            <button
              type="button"
              className="compass-btn-secondary"
              onClick={() =>
                onChange({ ...recipe, rules: rules.filter((_, j) => i !== j) })
              }
            >
              Remove rule
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={rules.length >= 12}
        className="compass-btn-secondary"
        onClick={() =>
          onChange({
            ...recipe,
            rules: [
              ...rules,
              {
                id:
                  "signal_" +
                  crypto.randomUUID().replaceAll("-", "").slice(0, 12),
                label: "New signal",
                field: "installation_project",
                opener: "Saw {company} shared {signal}.",
                subject: "",
              },
            ],
          })
        }
      >
        Add signal rule
      </button>
      <p className="text-xs text-neutral-600">
        Use {"{company}"}, {"{service}"}, {"{service_area}"} or {"{signal}"} in
        a matched rule. You can also reference a named evidence field, such as{" "}
        {"{installation_project}"}. Every referenced fact needs an exact quote
        and source. Ambiguous facts do not match.
      </p>
      <label className="block text-xs">
        Fallback opener
        <textarea
          required
          rows={3}
          maxLength={500}
          className={input}
          value={recipe.opener}
          onChange={(e) => onChange({ ...recipe, opener: e.target.value })}
        />
      </label>
      <label className="block text-xs">
        Default subject
        <input
          required
          maxLength={200}
          className={input}
          value={recipe.subject}
          onChange={(e) => onChange({ ...recipe, subject: e.target.value })}
        />
      </label>
      <label className="flex gap-2 text-xs">
        <input
          type="checkbox"
          checked={recipe.include_name !== false}
          onChange={(e) =>
            onChange({ ...recipe, include_name: e.target.checked })
          }
        />
        Add a greeting only when a published person name is evidenced.
      </label>
      <p className="text-xs text-neutral-600">
        Saving invalidates earlier preparation. Reprocess the same candidates to
        review the new output; old versions stay in history.
      </p>
    </div>
  );
}
