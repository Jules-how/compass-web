"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CheckSquare2, Heading2, List, Plus, Type } from "lucide-react";

type BlockKind = "text" | "heading" | "bullet" | "check";
type Block = { id: number; kind: BlockKind; text: string; checked: boolean };
const options = [
  { kind: "text" as const, label: "Text", icon: Type },
  { kind: "heading" as const, label: "Heading", icon: Heading2 },
  { kind: "bullet" as const, label: "Bullet list", icon: List },
  { kind: "check" as const, label: "Checklist", icon: CheckSquare2 },
];
function parse(value: string): Block[] {
  return value.split("\n").map((line, id) => {
    const check = /^- \[([ xX])\] (.*)$/.exec(line);
    if (check)
      return { id, kind: "check", text: check[2], checked: check[1] !== " " };
    if (line.startsWith("## "))
      return { id, kind: "heading", text: line.slice(3), checked: false };
    if (line.startsWith("- "))
      return { id, kind: "bullet", text: line.slice(2), checked: false };
    return { id, kind: "text", text: line, checked: false };
  });
}
function serialize(blocks: Block[]) {
  return blocks
    .map(
      (b) =>
        `${b.kind === "heading" ? "## " : b.kind === "bullet" ? "- " : b.kind === "check" ? `- [${b.checked ? "x" : " "}] ` : ""}${b.text}`,
    )
    .join("\n");
}

/** Plain-text blocks round-trip to the existing note body; no hidden HTML or second store. */
export function NotebookEditor({
  value,
  onChange,
  label = "Page content",
  placeholder = "Start writing. Use / for a heading, list or checklist.",
  maxLength = 20000,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  const [blocks, setBlocks] = useState(() => parse(value));
  const lastValue = useRef(value);
  const counter = useRef(blocks.length);
  const elements = useRef(new Map<number, HTMLTextAreaElement>());
  const container = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(blocks[0].id);
  const [menu, setMenu] = useState<number | null>(null);
  const [limit, setLimit] = useState(false);
  const pendingFocus = useRef<{ id: number; offset: number } | null>(null);
  function resizeBlocks() {
    const inputs = [...elements.current.values()];
    inputs.forEach((el) => {
      el.style.height = "0px";
    });
    const heights = inputs.map((el) => el.scrollHeight);
    inputs.forEach((el, index) => {
      el.style.height = `${heights[index]}px`;
    });
  }
  useLayoutEffect(() => {
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== width) {
        width = entry.contentRect.width;
        resizeBlocks();
      }
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (value !== lastValue.current) {
      const next = parse(value).map((b) => ({ ...b, id: counter.current++ }));
      setBlocks(next);
      lastValue.current = value;
    }
  }, [value]);
  useLayoutEffect(() => {
    resizeBlocks();
    if (pendingFocus.current) {
      const { id, offset } = pendingFocus.current;
      const el = elements.current.get(id);
      el?.focus({ preventScroll: true });
      el?.setSelectionRange(offset, offset);
      pendingFocus.current = null;
    }
  }, [blocks]);
  function commit(next: Block[]) {
    const text = serialize(next);
    if (text.length > maxLength) {
      setLimit(true);
      return false;
    }
    setLimit(false);
    lastValue.current = text;
    setBlocks(next);
    onChange(text);
    return true;
  }
  function choose(kind: BlockKind) {
    const id = menu ?? active;
    const block = blocks.find((b) => b.id === id) ?? blocks[blocks.length - 1];
    if (!block.text || block.text === "/") {
      commit(
        blocks.map((b) => (b.id === block.id ? { ...b, text: "", kind } : b)),
      );
      pendingFocus.current = { id: block.id, offset: 0 };
    } else {
      const next = { id: counter.current++, kind, text: "", checked: false };
      const index = blocks.indexOf(block);
      commit([...blocks.slice(0, index + 1), next, ...blocks.slice(index + 1)]);
      pendingFocus.current = { id: next.id, offset: 0 };
    }
    setMenu(null);
  }
  return (
    <div
      ref={container}
      className="notebook-editor"
      role="group"
      aria-label={label}
    >
      <div className="notebook-tools" role="group" aria-label="Insert a block">
        {options.map(({ kind, label, icon: Icon }) => (
          <button key={kind} type="button" onClick={() => choose(kind)}>
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        ))}
        <span>Write freely. Give ideas a little structure.</span>
      </div>
      <div className="notebook-blocks">
        {blocks.map((block, index) => (
          <div
            key={block.id}
            className={`notebook-block is-${block.kind} ${block.checked ? "is-checked" : ""}`}
          >
            <button
              type="button"
              className="notebook-block-add"
              aria-label={`Insert below block ${index + 1}`}
              aria-expanded={menu === block.id}
              onClick={() => {
                setActive(block.id);
                setMenu(menu === block.id ? null : block.id);
              }}
            >
              <Plus size={15} aria-hidden="true" />
            </button>
            {block.kind === "check" && (
              <input
                type="checkbox"
                checked={block.checked}
                aria-label={`Complete ${block.text || `item ${index + 1}`}`}
                onChange={(e) =>
                  commit(
                    blocks.map((b) =>
                      b.id === block.id
                        ? { ...b, checked: e.target.checked }
                        : b,
                    ),
                  )
                }
              />
            )}
            {block.kind === "bullet" && (
              <span className="notebook-bullet" aria-hidden="true">
                •
              </span>
            )}
            <textarea
              ref={(el) => {
                if (el) elements.current.set(block.id, el);
                else elements.current.delete(block.id);
              }}
              aria-label={`${block.kind === "text" ? "Paragraph" : block.kind} ${index + 1}`}
              rows={1}
              value={block.text}
              placeholder={
                index === 0
                  ? placeholder
                  : block.kind === "heading"
                    ? "Heading"
                    : block.kind === "check"
                      ? "Something to do…"
                      : "Keep writing…"
              }
              onFocus={() => setActive(block.id)}
              onChange={(e) => {
                const text = e.target.value;
                const shortcut =
                  text === "## " || text === "# "
                    ? "heading"
                    : text === "- "
                      ? "bullet"
                      : text === "[] " || text === "- [ ] "
                        ? "check"
                        : null;
                commit(
                  blocks.map((b) =>
                    b.id === block.id
                      ? {
                          ...b,
                          text: shortcut ? "" : text,
                          kind: shortcut ?? b.kind,
                        }
                      : b,
                  ),
                );
                setMenu(text === "/" ? block.id : null);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (menu === block.id && e.key === "ArrowDown") {
                  e.preventDefault();
                  e.currentTarget.parentElement
                    ?.querySelector<HTMLButtonElement>(
                      ".notebook-block-menu button",
                    )
                    ?.focus();
                  return;
                }
                if (e.key === "Escape") {
                  setMenu(null);
                  return;
                }
                const el = e.currentTarget;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!block.text && block.kind !== "text") {
                    commit(
                      blocks.map((b) =>
                        b.id === block.id ? { ...b, kind: "text" } : b,
                      ),
                    );
                    return;
                  }
                  const start = el.selectionStart,
                    end = el.selectionEnd;
                  const next = {
                    id: counter.current++,
                    text: block.text.slice(end),
                    kind:
                      block.kind === "heading" ? ("text" as const) : block.kind,
                    checked: false,
                  };
                  pendingFocus.current = { id: next.id, offset: 0 };
                  if (
                    !commit([
                      ...blocks.slice(0, index),
                      { ...block, text: block.text.slice(0, start) },
                      next,
                      ...blocks.slice(index + 1),
                    ])
                  )
                    pendingFocus.current = null;
                  setMenu(null);
                }
                if (
                  e.key === "Backspace" &&
                  el.selectionStart === 0 &&
                  el.selectionEnd === 0
                ) {
                  if (block.kind !== "text") {
                    e.preventDefault();
                    commit(
                      blocks.map((b) =>
                        b.id === block.id
                          ? { ...b, kind: "text", checked: false }
                          : b,
                      ),
                    );
                  } else if (index > 0) {
                    e.preventDefault();
                    const previous = blocks[index - 1];
                    pendingFocus.current = {
                      id: previous.id,
                      offset: previous.text.length,
                    };
                    commit([
                      ...blocks.slice(0, index - 1),
                      { ...previous, text: previous.text + block.text },
                      ...blocks.slice(index + 1),
                    ]);
                  }
                }
              }}
            />
            {menu === block.id && (
              <div
                className="notebook-block-menu"
                role="group"
                aria-label="Choose a block type"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setMenu(null);
                    elements.current.get(block.id)?.focus();
                  }
                }}
              >
                {options.map(({ kind, label, icon: Icon }) => (
                  <button type="button" key={kind} onClick={() => choose(kind)}>
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          className="notebook-continue"
          onClick={() => {
            const last = blocks[blocks.length - 1];
            setActive(last.id);
            if (!last.text) elements.current.get(last.id)?.focus();
            else {
              const next = {
                id: counter.current++,
                kind: "text" as const,
                text: "",
                checked: false,
              };
              pendingFocus.current = { id: next.id, offset: 0 };
              commit([...blocks, next]);
            }
          }}
          aria-label="Continue writing on this page"
        />
      </div>
      {limit && (
        <p role="alert">
          This page is full ({maxLength.toLocaleString()} characters). Start a
          new page to keep writing.
        </p>
      )}
    </div>
  );
}
