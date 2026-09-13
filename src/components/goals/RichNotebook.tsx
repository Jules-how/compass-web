"use client";
import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontFamily } from "@tiptap/extension-text-style";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { documentFromText, documentText } from "@/lib/rich-document.mjs";
import { workFetch } from "@/lib/workspace-change";
import type { PlanningRow } from "@/lib/planning-server";

const CompassTask = Node.create({
  name: "compassTask",
  group: "block",
  atom: true,
  addAttributes() {
    return { taskId: { default: "" }, label: { default: "Linked action" } };
  },
  parseHTML() {
    return [{ tag: "a[data-compass-task]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(
        {
          "data-compass-task": HTMLAttributes.taskId,
          href: `/tasks?task=${encodeURIComponent(HTMLAttributes.taskId)}`,
        },
        HTMLAttributes,
      ),
      HTMLAttributes.label,
    ];
  },
});
const extensions = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TextStyle,
  FontFamily,
  TaskList,
  TaskItem.configure({ nested: true }),
  CompassTask,
];
type Subject = { kind: "goal" | "contact"; id: string };
export function RichNotebook({
  subject,
  tasks = [],
}: {
  subject: Subject;
  tasks?: { id: string; title: string }[];
}) {
  const [record, setRecord] = useState<PlanningRow | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setRecord(null);
    setError("");
    fetch(
      `/api/planning/notebook?kind=${subject.kind}&id=${encodeURIComponent(subject.id)}`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        if (live) setRecord(b.record);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [subject.kind, subject.id]);
  if (error) return <p role="alert">{error}</p>;
  if (!record) return <p role="status">Loading notebook…</p>;
  return (
    <NotebookBody
      key={record.id}
      initial={record}
      subject={subject}
      tasks={tasks}
    />
  );
}
function NotebookBody({
  initial,
  subject,
  tasks,
}: {
  initial: PlanningRow;
  subject: Subject;
  tasks: { id: string; title: string }[];
}) {
  const revision = useRef(initial.revision),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    pending = useRef<any>(null),
    flight = useRef(false),
    dirty = useRef(false);
  const [status, setStatus] = useState("Saved"),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<any>(null),
    [remote, setRemote] = useState<PlanningRow | null>(null);
  const key = `compass.notebook.draft:${initial.id}`;
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    content:
      initial.data.document?.content ||
      documentFromText(initial.data.body).content,
    editorProps: {
      attributes: {
        class: "goal-rich-content",
        role: "textbox",
        "aria-label":
          subject.kind === "goal" ? "Goal notebook" : "Contact notebook",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => {
      dirty.current = true;
      setStatus("Unsaved");
      const document = { version: 1, content: editor.getJSON() };
      try {
        localStorage.setItem(key, JSON.stringify(document));
      } catch {}
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), 900);
    },
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;
  async function save() {
    if (
      flight.current ||
      !editorRef.current ||
      (!dirty.current && !pending.current)
    )
      return;
    flight.current = true;
    setStatus("Saving…");
    setError("");
    const payload = pending.current || {
      subject,
      revision: revision.current,
      request_id: crypto.randomUUID(),
      document: { version: 1, content: editorRef.current.getJSON() },
    };
    pending.current = payload;
    try {
      const r = await workFetch("/api/planning/notebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Notebook was not saved.");
      revision.current = b.record.revision;
      pending.current = null;
      dirty.current =
        JSON.stringify(editorRef.current.getJSON()) !==
        JSON.stringify(payload.document.content);
      setStatus(dirty.current ? "Unsaved" : "Saved");
      if (!dirty.current) {
        try {
          localStorage.removeItem(key);
        } catch {}
      }
    } catch (e) {
      setStatus("Not saved");
      setError(
        e instanceof Error ? e.message : "Save failed. Your draft is retained.",
      );
    } finally {
      flight.current = false;
      if (!pending.current && dirty.current)
        timer.current = setTimeout(() => void save(), 900);
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (
        saved &&
        saved !==
          JSON.stringify(
            initial.data.document || documentFromText(initial.data.body),
          )
      )
        setDraft(JSON.parse(saved));
    } catch {}
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void saveRef.current();
    };
  }, [key, initial]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty.current || pending.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, []);
  if (!editor) return <p role="status">Opening editor…</p>;
  return (
    <div className="goal-notebook-editor">
      {draft && (
        <div className="goal-notice">
          A local draft is available.{" "}
          <button
            onClick={() => {
              editor.commands.setContent(draft.content);
              dirty.current = true;
              setDraft(null);
              setStatus("Unsaved");
            }}
          >
            Restore draft
          </button>
          <button
            onClick={() => {
              setDraft(null);
              localStorage.removeItem(key);
            }}
          >
            Use saved version
          </button>
        </div>
      )}
      <div
        className="goal-rich-tools"
        role="toolbar"
        aria-label="Notebook formatting"
      >
        <button
          aria-label="Bold"
          aria-pressed={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </button>
        <button
          aria-label="Italic"
          aria-pressed={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <i>I</i>
        </button>
        <button
          aria-label="Underline"
          aria-pressed={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <u>U</u>
        </button>
        <select
          aria-label="Text style"
          defaultValue="paragraph"
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n)
              editor
                .chain()
                .focus()
                .toggleHeading({ level: n as 1 | 2 | 3 })
                .run();
            else editor.chain().focus().setParagraph().run();
          }}
        >
          <option value="paragraph">Text</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        <select
          aria-label="Font"
          defaultValue="Geist"
          onChange={(e) =>
            editor.chain().focus().setFontFamily(e.target.value).run()
          }
        >
          <option value="Geist">Default</option>
          <option value="Georgia">Serif</option>
          <option value="monospace">Mono</option>
        </select>
        <button
          aria-label="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </button>
        <button
          aria-label="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </button>
        <button onClick={() => editor.chain().focus().toggleTaskList().run()}>
          Checklist
        </button>
        <button
          onClick={() => {
            const href = prompt("Link URL (https://…)");
            if (href && /^https?:\/\//i.test(href))
              editor.chain().focus().setLink({ href }).run();
          }}
        >
          Link
        </button>
        <button
          aria-label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </button>
        <button
          aria-label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </button>
        {tasks.length > 0 && (
          <select
            aria-label="Insert linked action"
            value=""
            onChange={(e) => {
              const t = tasks.find((t) => t.id === e.target.value);
              if (t)
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: "compassTask",
                    attrs: { taskId: t.id, label: t.title },
                  })
                  .run();
            }}
          >
            <option value="">Link action…</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}
        <span role="status">{status}</span>
        <button onClick={() => void save()}>Save</button>
      </div>
      {error && (
        <div className="goal-notice" role="alert">
          {error} Your draft is retained.{" "}
          <button onClick={() => void save()}>Retry same save</button>
          <button
            onClick={async () => {
              const r = await fetch(
                `/api/planning/notebook?kind=${subject.kind}&id=${encodeURIComponent(subject.id)}`,
                { cache: "no-store" },
              );
              const b = await r.json();
              if (r.ok) {
                setRemote(b.record);
              }
            }}
          >
            Compare latest saved version
          </button>
        </div>
      )}
      {remote && (
        <div className="goal-notice">
          <h3>Latest saved version · revision {remote.revision}</h3>
          <pre
            style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}
          >
            {remote.data.document
              ? documentText(remote.data.document)
              : remote.data.body}
          </pre>
          <p>
            Your editable draft remains below. Compare and merge any changes
            before replacing the saved version.
          </p>
          <button
            onClick={() => {
              revision.current = remote.revision;
              pending.current = null;
              dirty.current = true;
              setRemote(null);
              void save();
            }}
          >
            Save my reconciled draft
          </button>
          <button
            onClick={() => {
              editor.commands.setContent(
                remote.data.document?.content ||
                  documentFromText(remote.data.body).content,
              );
              revision.current = remote.revision;
              pending.current = null;
              dirty.current = false;
              setRemote(null);
              setError("");
              setStatus("Saved");
              localStorage.removeItem(key);
            }}
          >
            Use this saved version
          </button>
        </div>
      )}
      <div
        onBlur={(e) => {
          if (
            !e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)
          )
            void save();
        }}
      >
        <EditorContent editor={editor} />
      </div>
      <p className="goal-small">
        Checklist items are notes. Linked actions open the same Compass task.
      </p>
    </div>
  );
}
