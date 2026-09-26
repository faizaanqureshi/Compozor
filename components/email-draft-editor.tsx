"use client";

import { useCallback, useEffect, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, Italic, List, ListOrdered, Link2, Redo2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { docToPlainText, plainTextToDoc } from "@/lib/email-content";

// Deliberately restrained: only formatting the backend's send pipeline
// preserves (paragraphs, line breaks, bold, italic, bullet and numbered
// lists, links) is offered here - see lib/email-content.ts. No headings or
// colours, which would silently vanish on send.
function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(active && "bg-muted text-foreground")}
    >
      {children}
    </Button>
  );
}

function LinkControl({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const startEdit = useCallback(() => {
    const existing = editor.getAttributes("link").href as string | undefined;
    setUrl(existing ?? "");
    setOpen(true);
  }, [editor]);

  const apply = () => {
    const trimmed = url.trim();
    if (trimmed) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setOpen(false);
  };

  if (open) {
    return (
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <Input
          autoFocus
          aria-label="Link URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          onBlur={apply}
          placeholder="https://…"
          className="h-7 w-44 text-xs"
        />
      </form>
    );
  }

  return (
    <ToolbarButton active={editor.isActive("link")} onClick={startEdit} label="Link">
      <Link2 className="size-3.5" />
    </ToolbarButton>
  );
}

export function EmailDraftEditor({
  content,
  onChange,
  autoFocus = false,
  className,
}: {
  content: string;
  onChange: (plainText: string) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        strike: false,
        underline: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        heading: false,
        horizontalRule: false,
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
    ],
    content: plainTextToDoc(content),
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class:
          "prose-sm max-w-none focus:outline-none min-h-40 text-sm leading-relaxed text-foreground/90 [&_p]:my-2.5 [&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_a]:text-foreground [&_a]:underline [&_a]:decoration-foreground/30 [&_a]:underline-offset-2",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(docToPlainText(editor.getJSON()));
    },
  });

  // Keep the editor in sync if the underlying draft changes out from under
  // it (e.g. switching which message is being edited).
  useEffect(() => {
    if (!editor) return;
    const current = docToPlainText(editor.getJSON());
    if (current !== content.trim()) {
      editor.commands.setContent(plainTextToDoc(content));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border border-input bg-transparent", className)}>
      <div className="flex items-center gap-0.5 border-b border-border/70 px-2 py-1.5">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Bold"
        >
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Italic"
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          label="Bulleted list"
        >
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          label="Numbered list"
        >
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
        <LinkControl editor={editor} />
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          label="Undo"
        >
          <Undo2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          label="Redo"
        >
          <Redo2 className="size-3.5" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} className="px-3 pb-3" />
    </div>
  );
}
