"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Bold, CheckSquare2, Code2, Heading1, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Plus, Quote, Redo2, Type, Undo2 } from "lucide-react";
import { changeBlockKind, makeBlock, mergeNotebookBackward, NotebookHistory, notebookShortcut, parseNotebook, serializeNotebook, splitNotebookBlock, toggleNotebookCheck, type BlockKind, type NotebookBlock, type NotebookFocus } from "@/lib/notebook-model";

const options = [
  { kind: "text", label: "Text", hint: "Just start writing", icon: Type, keywords: "paragraph plain" },
  { kind: "heading1", label: "Heading 1", hint: "A large heading", icon: Heading1, keywords: "title h1" },
  { kind: "heading2", label: "Heading 2", hint: "A section heading", icon: Heading2, keywords: "subtitle h2" },
  { kind: "heading3", label: "Heading 3", hint: "A small heading", icon: Heading3, keywords: "h3" },
  { kind: "bullet", label: "Bullet list", hint: "A simple list", icon: List, keywords: "unordered bullets" },
  { kind: "numbered", label: "Numbered list", hint: "An ordered sequence", icon: ListOrdered, keywords: "ordered numbers" },
  { kind: "check", label: "To-do list", hint: "Things to check off", icon: CheckSquare2, keywords: "checklist task checkbox todo" },
  { kind: "quote", label: "Quote", hint: "Make a passage stand out", icon: Quote, keywords: "blockquote" },
  { kind: "divider", label: "Divider", hint: "Separate your thoughts", icon: Minus, keywords: "line horizontal rule" },
  { kind: "code", label: "Code", hint: "A plain code block", icon: Code2, keywords: "fence preformatted" },
] satisfies { kind: BlockKind; label: string; hint: string; icon: typeof Type; keywords: string }[];
type Menu = { id: number; source: "slash" | "button"; query: string; index: number };

/** Text blocks retain the existing Markdown body without a second content store. */
export function NotebookEditor({ value, onChange, label = "Page content", placeholder = "Start writing, or type / for commands…", maxLength = 20000 }: {
  value: string; onChange: (value: string) => void; label?: string; placeholder?: string; maxLength?: number;
}) {
  const [blocks, setBlocks] = useState(() => parseNotebook(value));
  const lastValue = useRef(value), counter = useRef(blocks.length);
  const elements = useRef(new Map<number, HTMLTextAreaElement>());
  const container = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(blocks[0].id);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [limit, setLimit] = useState(false);
  const pendingFocus = useRef<NotebookFocus | null>(null);
  const history = useRef(new NotebookHistory());
  const uid = useId();
  const filtered = options.filter((o) => `${o.label} ${o.keywords}`.toLowerCase().includes(menu?.query.toLowerCase() ?? ""));
  const selectedOption = Math.min(menu?.index ?? 0, Math.max(0, filtered.length - 1));
  function resizeBlocks() {
    const inputs = [...elements.current.values()];
    inputs.forEach((el) => { el.style.height = "0px"; });
    const heights = inputs.map((el) => el.scrollHeight);
    inputs.forEach((el, index) => { el.style.height = `${heights[index]}px`; });
  }
  useLayoutEffect(() => {
    let width = 0;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width !== width) { width = entry.contentRect.width; resizeBlocks(); } });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (value !== lastValue.current) {
      const next = parseNotebook(value, counter.current); counter.current += next.length;
      setBlocks(next); lastValue.current = value; history.current = new NotebookHistory(); setMenu(null);
    }
  }, [value]);
  useLayoutEffect(() => {
    resizeBlocks();
    if (pendingFocus.current) {
      const { id, offset } = pendingFocus.current, el = elements.current.get(id);
      el?.focus({ preventScroll: true }); el?.setSelectionRange(offset, offset);
      if (el && (el.getBoundingClientRect().bottom > window.innerHeight - 40 || el.getBoundingClientRect().top < 80)) el.scrollIntoView({ block: "nearest" });
      pendingFocus.current = null;
    }
  }, [blocks]);
  function focused(): NotebookFocus | null {
    const el = elements.current.get(active); return el ? { id: active, offset: el.selectionStart } : null;
  }
  function commit(next: NotebookBlock[], focus: NotebookFocus | null = null, group = "", remember = true) {
    const text = serializeNotebook(next);
    if (text.length > maxLength) { setLimit(true); return false; }
    if (remember && text !== lastValue.current) history.current.record({ blocks, focus: focused() }, group);
    setLimit(false); lastValue.current = text; pendingFocus.current = focus; setBlocks(next); onChange(text); return true;
  }
  function travel(direction: "undo" | "redo") {
    const snapshot = history.current[direction]({ blocks, focus: focused() });
    if (snapshot) commit(snapshot.blocks, snapshot.focus, "", false);
    setMenu(null);
  }
  function choose(kind: BlockKind) {
    const index = Math.max(0, blocks.findIndex((b) => b.id === (menu?.id ?? active))), block = blocks[index];
    const text = menu?.source === "slash" ? "" : block.text;
    if (kind === "divider" && text) {
      const divider = makeBlock(counter.current++, "divider"), after = makeBlock(counter.current++);
      commit([...blocks.slice(0, index + 1), divider, after, ...blocks.slice(index + 1)], { id: after.id, offset: 0 });
    } else {
      const changed = changeBlockKind({ ...block, text }, kind), next = blocks.map((b) => b.id === block.id ? changed : b);
      if (kind === "divider") { const after = makeBlock(counter.current++); next.splice(index + 1, 0, after); commit(next, { id: after.id, offset: 0 }); }
      else commit(next, { id: block.id, offset: changed.text.length });
    }
    setMenu(null);
  }
  function inline(mark: "bold" | "italic" | "link") {
    const el = elements.current.get(active), block = blocks.find((b) => b.id === active);
    if (!el || !block || block.kind === "divider") return;
    const start = el.selectionStart, end = el.selectionEnd, selection = block.text.slice(start, end);
    const left = mark === "bold" ? "**" : mark === "italic" ? "_" : "[", right = mark === "link" ? "](https://)" : left;
    commit(blocks.map((b) => b.id === active ? { ...b, text: b.text.slice(0, start) + left + selection + right + b.text.slice(end) } : b), { id: active, offset: start + left.length + selection.length });
  }
  function navigate(id: number, offset: number) {
    const el = elements.current.get(id); el?.focus(); el?.setSelectionRange(offset, offset);
  }
  return <div ref={container} className="notebook-editor" role="group" aria-label={label} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setMenu(null); }} onKeyDown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); travel(e.shiftKey ? "redo" : "undo"); }
    else if (e.ctrlKey && e.key.toLowerCase() === "y") { e.preventDefault(); travel("redo"); }
  }}>
    <div className="notebook-tools" role="group" aria-label="Writing tools">
      <button type="button" onClick={() => setMenu({ id: active, source: "button", query: "", index: 0 })} aria-expanded={!!menu} aria-controls={`${uid}-commands`}><Plus size={15} aria-hidden="true" /> Insert</button>
      <span className="notebook-tool-separator" aria-hidden="true" />
      {([{ mark: "bold", icon: Bold, label: "Insert bold Markdown" }, { mark: "italic", icon: Italic, label: "Insert italic Markdown" }, { mark: "link", icon: Link2, label: "Insert Markdown link" }] as const).map(({ mark, icon: Icon, label: name }) => <button key={mark} type="button" aria-label={name} title={name} onMouseDown={(e) => e.preventDefault()} onClick={() => inline(mark)}><Icon size={15} aria-hidden="true" /></button>)}
      <div className="notebook-history-tools"><button type="button" aria-label="Undo writing change" title="Undo · ⌘Z / Ctrl+Z" disabled={!history.current.canUndo} onClick={() => travel("undo")}><Undo2 size={15} aria-hidden="true" /></button><button type="button" aria-label="Redo writing change" title="Redo · ⇧⌘Z / Ctrl+Y" disabled={!history.current.canRedo} onClick={() => travel("redo")}><Redo2 size={15} aria-hidden="true" /></button></div>
      <details className="notebook-writing-help"><summary>Writing help</summary><p>Type / on a new line to find a block. Enter starts a block; Shift+Enter adds a line within it. Enter on an empty list item returns to text. ⌘Z or Ctrl+Z undoes changes across blocks. Inline formatting uses Markdown: **bold**, _italic_, [link](url). In code, Enter adds a line; ⌘Enter or Ctrl+Enter leaves the block.</p></details>
    </div>
    <div className="notebook-blocks">
      {blocks.map((block, index) => <div key={block.id} className={`notebook-block is-${block.kind} ${block.checked ? "is-checked" : ""}`}>
        <button type="button" className="notebook-block-add" aria-label={`Change or insert block ${index + 1}`} aria-expanded={menu?.id === block.id} aria-controls={menu?.id === block.id ? `${uid}-commands` : undefined} onClick={() => { setActive(block.id); setMenu(menu?.id === block.id ? null : { id: block.id, source: "button", query: "", index: 0 }); }}><Plus size={15} aria-hidden="true" /></button>
        {block.kind === "check" && <input type="checkbox" checked={block.checked} aria-label={`Complete ${block.text || `item ${index + 1}`}`} onChange={(e) => commit(blocks.map((b) => b.id === block.id ? toggleNotebookCheck(b, e.target.checked) : b))} />}
        {["bullet", "numbered"].includes(block.kind) && <span className="notebook-bullet" aria-hidden="true">{block.kind === "bullet" ? "•" : block.prefix.trim()}</span>}
        {block.kind === "divider" ? <button type="button" className="notebook-divider" aria-label={`Divider ${index + 1}. Press Backspace to remove.`} onKeyDown={(e) => {
          if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); const next = blocks.filter((b) => b.id !== block.id); if (!next.length) next.push(makeBlock(counter.current++)); commit(next, { id: next[Math.min(index, next.length - 1)].id, offset: 0 }); }
          if (e.key === "Enter") { e.preventDefault(); const next = makeBlock(counter.current++); commit([...blocks.slice(0, index + 1), next, ...blocks.slice(index + 1)], { id: next.id, offset: 0 }); }
        }}><span /></button> : <textarea
          ref={(el) => { if (el) elements.current.set(block.id, el); else elements.current.delete(block.id); }}
          aria-label={`${options.find((o) => o.kind === block.kind)?.label ?? "Paragraph"} ${index + 1}`} aria-describedby={limit ? `${uid}-limit` : undefined}
          aria-controls={menu?.id === block.id ? `${uid}-commands` : undefined} aria-activedescendant={menu?.id === block.id && filtered.length ? `${uid}-option-${selectedOption}` : undefined}
          rows={1} value={block.text} spellCheck={block.kind !== "code"}
          placeholder={index === 0 ? placeholder : block.kind.startsWith("heading") ? options.find((o) => o.kind === block.kind)?.label : block.kind === "code" ? "Code" : "Type / for commands"}
          onFocus={() => setActive(block.id)} onChange={(e) => {
            const text = e.target.value, shortcut = block.kind === "text" ? notebookShortcut(text) : null, next = shortcut ? makeBlock(block.id, shortcut) : { ...block, text };
            if (shortcut === "divider") { const after = makeBlock(counter.current++); commit([...blocks.slice(0, index), next, after, ...blocks.slice(index + 1)], { id: after.id, offset: 0 }); }
            else commit(blocks.map((b) => b.id === block.id ? next : b), null, shortcut ? "" : `typing:${block.id}`);
            setMenu(block.kind === "text" && /^\/[^\n]*$/.test(text) ? { id: block.id, source: "slash", query: text.slice(1), index: 0 } : null);
          }} onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (menu?.id === block.id && ["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(e.key)) {
              if (e.key === "Escape" || e.key === "Tab") { setMenu(null); if (e.key === "Escape") e.preventDefault(); return; }
              if (e.key === "Enter" && !filtered.length) setMenu(null);
              else { e.preventDefault(); if (e.key === "Enter") choose(filtered[selectedOption].kind); else setMenu({ ...menu, index: (selectedOption + (e.key === "ArrowDown" ? 1 : -1) + filtered.length) % Math.max(1, filtered.length) }); return; }
            }
            if ((e.metaKey || e.ctrlKey) && ["b", "i", "k"].includes(e.key.toLowerCase())) { e.preventDefault(); inline(e.key.toLowerCase() === "b" ? "bold" : e.key.toLowerCase() === "i" ? "italic" : "link"); return; }
            const el = e.currentTarget, start = el.selectionStart, end = el.selectionEnd;
            if (e.key === "Enter" && !e.shiftKey && (block.kind !== "code" || e.metaKey || e.ctrlKey)) { e.preventDefault(); const result = splitNotebookBlock(blocks, index, start, end, counter.current++); commit(result.blocks, result.focus); setMenu(null); }
            else if (e.key === "Backspace" && !start && !end) { const result = mergeNotebookBackward(blocks, index); if (result) { e.preventDefault(); commit(result.blocks, result.focus); } }
            else if (e.key === "Delete" && start === block.text.length && end === start && blocks[index + 1]) {
              e.preventDefault(); const next = blocks[index + 1];
              if (next.kind === "divider") commit(blocks.filter((b) => b.id !== next.id), { id: block.id, offset: start });
              else commit([...blocks.slice(0, index), { ...block, text: block.text + next.text }, ...blocks.slice(index + 2)], { id: block.id, offset: start });
            }
            else if (e.key === "ArrowUp" && !start && !end && index > 0) { const previous = [...blocks.slice(0, index)].reverse().find((b) => b.kind !== "divider"); if (previous) { e.preventDefault(); navigate(previous.id, previous.text.length); } }
            else if (e.key === "ArrowDown" && start === block.text.length && end === start) { const next = blocks.slice(index + 1).find((b) => b.kind !== "divider"); if (next) { e.preventDefault(); navigate(next.id, 0); } }
          }}
        />}
        {menu?.id === block.id && <div id={`${uid}-commands`} className="notebook-block-menu" role="listbox" aria-label="Block commands" onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); setMenu(null); navigate(block.id, block.text.length); }
          if (["ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); const next = (selectedOption + (e.key === "ArrowDown" ? 1 : -1) + filtered.length) % Math.max(1, filtered.length); setMenu({ ...menu, index: next }); e.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus(); }
        }}>
          {menu.source === "button" && <input autoFocus aria-label="Search block commands" placeholder="Search commands…" value={menu.query} onChange={(e) => setMenu({ ...menu, query: e.target.value, index: 0 })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (filtered.length) choose(filtered[selectedOption].kind); } }} />}
          <span className="notebook-menu-label">{menu.query ? "Matching blocks" : "Basic blocks"}</span>
          {filtered.map(({ kind, label: name, hint, icon: Icon }, optionIndex) => <button role="option" aria-selected={selectedOption === optionIndex} id={`${uid}-option-${optionIndex}`} type="button" key={kind} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(kind)} onFocus={() => setMenu({ ...menu, index: optionIndex })}><Icon size={18} aria-hidden="true" /><span><strong>{name}</strong><small>{hint}</small></span></button>)}
          {!filtered.length && <p role="status">No matching blocks</p>}
        </div>}
      </div>)}
      <button type="button" className="notebook-continue" onClick={() => { const last = blocks[blocks.length - 1]; setActive(last.id); if (!last.text && last.kind === "text") navigate(last.id, 0); else { const next = makeBlock(counter.current++); commit([...blocks, next], { id: next.id, offset: 0 }); } }} aria-label="Continue writing on this page" />
    </div>
    {limit && <p id={`${uid}-limit`} role="alert">This page is full ({maxLength.toLocaleString()} characters). Your last change was not inserted. Start a new page to keep writing.</p>}
  </div>;
}
