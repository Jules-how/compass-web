"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
export function PlannerNotes({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string, text: string) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: { "aria-label": "Task notes", class: "dp-note-editor" },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText()),
  });
  useEffect(() => {
    if (editor && editor.getHTML() !== value && !editor.isFocused)
      editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  return (
    <div className="dp-notes">
      <div className="dp-note-tools">
        {[
          {
            label: "Bold",
            action: () => editor?.chain().focus().toggleBold().run(),
          },
          {
            label: "Italic",
            action: () => editor?.chain().focus().toggleItalic().run(),
          },
          {
            label: "Bullet list",
            action: () => editor?.chain().focus().toggleBulletList().run(),
          },
          {
            label: "Heading",
            action: () =>
              editor?.chain().focus().toggleHeading({ level: 3 }).run(),
          },
          { label: "Undo", action: () => editor?.chain().focus().undo().run() },
        ].map((b) => (
          <button type="button" key={b.label} onClick={b.action}>
            {b.label}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
