"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { Loader2, Plus, X } from "lucide-react";

import {
  ApiError,
  deleteOrganizationFont,
  listOrganizationFonts,
  uploadOrganizationFont,
} from "@/lib/api";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const FONTS_KEY = "/organizations/me/fonts";

// Brand fonts the firm's documents use. Previews and document checks render
// with them, so what staff approve matches what clients see.
export function FirmFontsSection() {
  const { data: fonts, error: loadError, mutate } = useSWR(FONTS_KEY, listOrganizationFonts);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) await uploadOrganizationFont(file);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      void mutate();
    }
  };

  const remove = async (fontId: number) => {
    setError(null);
    try {
      await deleteOrganizationFont(fontId);
      void mutate();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't remove the font. Try again.");
    }
  };

  return (
    <Panel
      title="Fonts"
      meta="For document previews"
      loadError={loadError ? String(loadError) : null}
      action={
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
          Upload font
        </Button>
      }
    >
      <p className="max-w-prose text-sm text-muted-foreground">
        If your templates use brand fonts, upload them here so previews and checks look the way your clients see the documents. Upload only fonts your firm is licensed to use. TrueType or OpenType, up to 10 MB each.
      </p>
      <input
        ref={input}
        type="file"
        multiple
        accept=".ttf,.otf,.ttc"
        aria-label="Upload font files"
        className="sr-only"
        onChange={(event) => void upload(event.target.files)}
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!fonts ? (
        <Skeleton className="h-10 w-full" />
      ) : fonts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fonts uploaded. Previews use standard fonts.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {fonts.map((font) => (
            <li key={font.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm">{font.family}</p>
                <p className="break-words text-xs text-muted-foreground">{font.filename}</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${font.family}`} onClick={() => void remove(font.id)}>
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
