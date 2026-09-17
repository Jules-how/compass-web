"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/** Bounded, editor-local history. The caller's buffer remains the persistence owner. */
export function useDraftHistory<T>(value: T, persist: Dispatch<SetStateAction<T>>) {
  const current = useRef(value);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, render] = useState(0);
  current.current = value;
  const change = useCallback((next: SetStateAction<T>) => {
    const before = current.current;
    const after = typeof next === "function" ? (next as (old: T) => T)(before) : next;
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    past.current = [...past.current.slice(-59), structuredClone(before)];
    future.current = [];
    current.current = after;
    persist(after);
    render(n => n + 1);
  }, [persist]);
  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (previous === undefined) return;
    future.current.push(structuredClone(current.current));
    current.current = previous;
    persist(previous);
    render(n => n + 1);
  }, [persist]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next === undefined) return;
    past.current.push(structuredClone(current.current));
    current.current = next;
    persist(next);
    render(n => n + 1);
  }, [persist]);
  return { change, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}

/** An empty number is a valid editing state, never an implicit zero. Native validation blocks saving it. */
export function NumberField({ value, onValue, min = 0, max, step = 1, ...rest }: {
  value: number; onValue: (value: number) => void; min?: number; max?: number; step?: number;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <input {...rest} type="number" required min={min} max={max} step={step} value={draft}
    onChange={event => {
      const text = event.target.value;
      setDraft(text);
      if (text !== "" && event.target.validity.valid && Number.isFinite(Number(text))) onValue(Number(text));
    }} />;
}
