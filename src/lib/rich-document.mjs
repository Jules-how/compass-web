export const DOCUMENT_VERSION = 1;
const nodes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
  "compassTask",
]);
const marks = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "textStyle",
]);
const fonts = new Set(["Geist", "Georgia", "monospace"]);

/** A bounded allowlist is shared by the API and the editor; never persist arbitrary HTML. */
export function validateDocument(input) {
  if (
    !input ||
    input.version !== DOCUMENT_VERSION ||
    input.content?.type !== "doc"
  )
    throw new Error("Unsupported notebook format.");
  if (JSON.stringify(input).length > 180000)
    throw new Error("Notebook is too large; your saved text has not changed.");
  let count = 0,
    length = 0;
  function node(n, depth = 0) {
    if (++count > 8000 || depth > 20 || !nodes.has(n?.type))
      throw new Error("Unsupported notebook content.");
    const block = new Set([
      "paragraph",
      "heading",
      "bulletList",
      "orderedList",
      "taskList",
      "blockquote",
      "codeBlock",
      "horizontalRule",
      "compassTask",
    ]);
    const allowed =
      n.type === "doc" || n.type === "blockquote"
        ? block
        : n.type === "paragraph" || n.type === "heading"
          ? new Set(["text", "hardBreak"])
          : n.type === "bulletList" || n.type === "orderedList"
            ? new Set(["listItem"])
            : n.type === "taskList"
              ? new Set(["taskItem"])
              : n.type === "listItem" || n.type === "taskItem"
                ? block
                : n.type === "codeBlock"
                  ? new Set(["text"])
                  : new Set();
    if (
      n.content &&
      (!Array.isArray(n.content) ||
        n.content.some((c) => !allowed.has(c?.type)))
    )
      throw new Error("Invalid notebook block structure.");
    if (n.marks && (!Array.isArray(n.marks) || n.type !== "text"))
      throw new Error("Invalid text formatting.");
    const result = { type: n.type };
    if (n.type === "text") {
      if (typeof n.text !== "string") throw new Error("Invalid notebook text.");
      length += n.text.length;
      result.text = n.text;
    }
    if (n.attrs) {
      const a = {};
      if (n.type === "heading")
        a.level = [1, 2, 3].includes(n.attrs.level) ? n.attrs.level : 2;
      if (n.type === "orderedList")
        a.start = Math.max(1, Math.min(10000, Number(n.attrs.start) || 1));
      if (n.type === "taskItem") a.checked = n.attrs.checked === true;
      if (n.type === "compassTask") {
        if (!/^[-a-zA-Z0-9_.:]{1,200}$/.test(n.attrs.taskId || ""))
          throw new Error("Invalid linked action.");
        a.taskId = n.attrs.taskId;
        a.label = String(n.attrs.label || "Linked action").slice(0, 250);
      }
      result.attrs = a;
    }
    if (n.type === "compassTask" && !result.attrs?.taskId)
      throw new Error("Linked action is missing its identity.");
    if (n.marks)
      result.marks = n.marks.map((m) => {
        if (!marks.has(m.type))
          throw new Error("Unsupported notebook formatting.");
        if (m.type === "link") {
          if (!/^https?:\/\//i.test(m.attrs?.href || ""))
            throw new Error("Notebook links must use HTTPS or HTTP.");
          const url = new URL(m.attrs.href);
          if (url.username || url.password)
            throw new Error("Do not put credentials in notebook links.");
          return {
            type: "link",
            attrs: {
              href: url.href,
              target: "_blank",
              rel: "noopener noreferrer",
            },
          };
        }
        if (m.type === "textStyle") {
          if (!fonts.has(m.attrs?.fontFamily))
            throw new Error("Choose Default, Serif or Mono.");
          return { type: m.type, attrs: { fontFamily: m.attrs.fontFamily } };
        }
        return { type: m.type };
      });
    if (n.content) {
      if (!Array.isArray(n.content))
        throw new Error("Invalid notebook blocks.");
      result.content = n.content.map((c) => node(c, depth + 1));
    }
    return result;
  }
  const content = node(input.content);
  if (length > 20000)
    throw new Error(
      "Notebook text exceeds 20,000 characters; split it before saving.",
    );
  return { version: DOCUMENT_VERSION, content };
}

/** Legacy Markdown remains literal, lossless text until explicitly formatted by its author. */
export function documentFromText(text = "") {
  return {
    version: DOCUMENT_VERSION,
    content: {
      type: "doc",
      content: String(text)
        .split("\n")
        .map((line) => ({
          type: "paragraph",
          ...(line ? { content: [{ type: "text", text: line }] } : {}),
        })),
    },
  };
}
export function documentText(document) {
  function plain(node) {
    if (node.type === "text") return node.text;
    if (node.type === "hardBreak") return "\n";
    if (node.type === "compassTask")
      return `[${node.attrs.label}](/tasks?task=${encodeURIComponent(node.attrs.taskId)})`;
    const text = (node.content || []).map(plain).join("");
    return (
      text +
      ([
        "paragraph",
        "heading",
        "listItem",
        "taskItem",
        "blockquote",
        "codeBlock",
      ].includes(node.type)
        ? "\n"
        : "")
    );
  }
  return plain(document.content).replace(/\n$/, "");
}
