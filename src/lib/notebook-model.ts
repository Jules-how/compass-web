export type BlockKind = "text" | "heading1" | "heading2" | "heading3" | "bullet" | "numbered" | "check" | "quote" | "divider" | "code";
export type NotebookBlock = {
  id: number;
  kind: BlockKind;
  text: string;
  prefix: string;
  suffix: string;
  checked: boolean;
};
export type NotebookFocus = { id: number; offset: number };

const prefixes: Record<BlockKind, string> = { text: "", heading1: "# ", heading2: "## ", heading3: "### ", bullet: "- ", numbered: "1. ", check: "- [ ] ", quote: "> ", divider: "---", code: "```\n" };

export function makeBlock(id: number, kind: BlockKind = "text", text = ""): NotebookBlock {
  return { id, kind, text, prefix: prefixes[kind], suffix: kind === "code" ? "\n```" : "", checked: false };
}

/** Preserve the exact Markdown delimiters, whitespace, blank lines and unsupported syntax. */
export function parseNotebook(value: string, firstId = 0): NotebookBlock[] {
  const lines = value.split("\n"), blocks: NotebookBlock[] = [];
  let id = firstId;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^( {0,3})(`{3,}|~{3,})([^\r]*)$/.exec(line);
    if (fence) {
      let end = i + 1;
      const closing = new RegExp(`^ {0,3}${fence[2][0]}{${fence[2].length},}\\s*$`);
      while (end < lines.length && !closing.test(lines[end])) end++;
      // An unfinished fence stays plain text until closed; never add closing text on save.
      if (end < lines.length) {
        blocks.push({ ...makeBlock(id++, "code"), prefix: `${line}\n`, text: lines.slice(i + 1, end).join("\n"), suffix: end === i + 1 ? lines[end] : `\n${lines[end]}` });
        i = end;
        continue;
      }
    }
    let kind: BlockKind = "text", prefix = "", text = line, checked = false;
    const check = /^(\s*[-*+] \[([ xX])\]\s+)(.*)$/.exec(line);
    const heading = /^(#{1,3}\s+)(.*)$/.exec(line);
    const bullet = /^(\s*[-*+]\s+)(.*)$/.exec(line);
    const numbered = /^(\s*\d+[.)]\s+)(.*)$/.exec(line);
    const quote = /^(>\s?)(.*)$/.exec(line);
    if (check) { kind = "check"; prefix = check[1]; checked = check[2] !== " "; text = check[3]; }
    else if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { kind = "divider"; prefix = line; text = ""; }
    else if (heading) { kind = `heading${heading[1].trim().length}` as BlockKind; prefix = heading[1]; text = heading[2]; }
    else if (bullet) { kind = "bullet"; prefix = bullet[1]; text = bullet[2]; }
    else if (numbered) { kind = "numbered"; prefix = numbered[1]; text = numbered[2]; }
    else if (quote) { kind = "quote"; prefix = quote[1]; text = quote[2]; }
    blocks.push({ id: id++, kind, prefix, text, suffix: "", checked });
  }
  return blocks;
}

export function serializeNotebook(blocks: NotebookBlock[]): string {
  return blocks.map((b) => b.prefix + b.text + (b.kind === "code" && b.text && !b.suffix.startsWith("\n") ? "\n" : "") + b.suffix).join("\n");
}

export function changeBlockKind(block: NotebookBlock, kind: BlockKind): NotebookBlock {
  // Turning a code block into text retains its content, including internal new lines.
  const next = makeBlock(block.id, kind, block.text);
  return kind === "check" && block.checked ? toggleNotebookCheck(next, true) : next;
}

export function toggleNotebookCheck(block: NotebookBlock, checked: boolean): NotebookBlock {
  return { ...block, checked, prefix: block.prefix.replace(/\[[ xX]\]/, checked ? "[x]" : "[ ]") };
}

export function splitNotebookBlock(blocks: NotebookBlock[], index: number, start: number, end: number, id: number): { blocks: NotebookBlock[]; focus: NotebookFocus } {
  const block = blocks[index];
  if (block.kind === "code") return { blocks: [...blocks.slice(0, index + 1), makeBlock(id), ...blocks.slice(index + 1)], focus: { id, offset: 0 } };
  if (!block.text && block.kind !== "text" && block.kind !== "divider") {
    return { blocks: blocks.map((b, i) => i === index ? makeBlock(b.id) : b), focus: { id: block.id, offset: 0 } };
  }
  const kind = ["bullet", "numbered", "check", "quote"].includes(block.kind) ? block.kind : "text";
  const next = makeBlock(id, kind, block.text.slice(end));
  if (kind === "numbered") next.prefix = block.prefix.replace(/\d+/, (n) => String(Number(n) + 1));
  if (kind === "bullet" || kind === "quote") next.prefix = block.prefix;
  return { blocks: [...blocks.slice(0, index), { ...block, text: block.text.slice(0, start) }, next, ...blocks.slice(index + 1)], focus: { id, offset: 0 } };
}

export function mergeNotebookBackward(blocks: NotebookBlock[], index: number): { blocks: NotebookBlock[]; focus: NotebookFocus } | null {
  const block = blocks[index];
  if (block.kind !== "text") return { blocks: blocks.map((b, i) => i === index ? makeBlock(b.id, "text", b.text) : b), focus: { id: block.id, offset: 0 } };
  if (!index) return null;
  const previous = blocks[index - 1];
  // A divider has no editable text; remove it without attaching hidden content to it.
  if (previous.kind === "divider") return { blocks: blocks.filter((_, i) => i !== index - 1), focus: { id: block.id, offset: 0 } };
  return { blocks: [...blocks.slice(0, index - 1), { ...previous, text: previous.text + block.text }, ...blocks.slice(index + 1)], focus: { id: previous.id, offset: previous.text.length } };
}

export function notebookShortcut(text: string): BlockKind | null {
  const shortcuts: Record<string, BlockKind> = { "# ": "heading1", "## ": "heading2", "### ": "heading3", "- ": "bullet", "* ": "bullet", "1. ": "numbered", "[] ": "check", "- [ ] ": "check", "> ": "quote", "``` ": "code", "--- ": "divider" };
  return shortcuts[text] ?? null;
}

type Snapshot = { blocks: NotebookBlock[]; focus: NotebookFocus | null };
/** One history spans every block, so undo can restore splits, merges and formatting. */
export class NotebookHistory {
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private group = "";
  private at = 0;
  record(snapshot: Snapshot, group = "", now = Date.now()) {
    if (!group || group !== this.group || now - this.at > 650) {
      this.past.push(snapshot);
      if (this.past.length > 100) this.past.shift();
    }
    this.group = group; this.at = now; this.future = [];
  }
  undo(current: Snapshot): Snapshot | undefined {
    const previous = this.past.pop();
    if (previous) this.future.push(current);
    this.group = "";
    return previous;
  }
  redo(current: Snapshot): Snapshot | undefined {
    const next = this.future.pop();
    if (next) this.past.push(current);
    this.group = "";
    return next;
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}
