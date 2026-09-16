"use client";
import type { ReactNode } from "react";
import type { CommandState } from "./pipeline-client";
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="op-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function CommandNotice({ state }: { state: CommandState }) {
  return state.message ? (
    <div
      className={`op-notice ${state.failed ? "op-error" : ""}`}
      role={state.failed ? "alert" : "status"}
    >
      {state.message}
      {state.uncertain && (
        <button
          type="button"
          disabled={state.busy}
          onClick={() => void state.retry()}
        >
          Retry same request
        </button>
      )}
    </div>
  ) : null;
}
export const label = (value: string | null | undefined) =>
  (value || "Not assessed").replaceAll("_", " ");
export function Status({ value }: { value: string | null | undefined }) {
  return (
    <span className={`op-status op-status-${value || "unknown"}`}>
      {label(value)}
    </span>
  );
}
