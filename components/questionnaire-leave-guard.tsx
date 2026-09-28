"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isGuardedNavigation } from "@/lib/navigation-guard";

export type LeaveTarget = { kind: "href"; href: string } | { kind: "back" };

const GUARD = "__compozorQuestionnaireGuard";

/**
 * Intercepts leaving the editor while `blocked` (unsaved edits or a save in flight):
 * in-app links, browser back (via one guard history entry) and, through the
 * native prompt, refresh or closing the tab. When not blocked, navigation is
 * untouched, so a fully saved draft never prompts.
 */
export function useLeaveGuard({ blocked, historyGuard }: { blocked: boolean; historyGuard: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState<LeaveTarget | null>(null);
  const blockedRef = useRef(blocked);
  const bypass = useRef(false);
  useEffect(() => { blockedRef.current = blocked; }, [blocked]);

  useEffect(() => {
    if (!blocked) return;
    const warn = (e: BeforeUnloadEvent) => { if (!bypass.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [blocked]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!blockedRef.current || bypass.current || e.defaultPrevented) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || !isGuardedNavigation(anchor, e, window.location)) return;
      e.preventDefault();
      e.stopPropagation();
      const url = new URL(anchor.href);
      setTarget({ kind: "href", href: url.pathname + url.search + url.hash });
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!historyGuard) return;
    if (!(window.history.state as Record<string, unknown> | null)?.[GUARD]) {
      window.history.pushState({ ...(window.history.state ?? {}), [GUARD]: true }, "", window.location.href);
    }
    const onPop = (e: PopStateEvent) => {
      if (bypass.current || (e.state as Record<string, unknown> | null)?.[GUARD]) return;
      if (!blockedRef.current) { window.history.back(); return; }
      // Stay on the editor: restore the guard entry and ask first.
      window.history.pushState({ ...(window.history.state ?? {}), [GUARD]: true }, "", window.location.href);
      setTarget({ kind: "back" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [historyGuard]);

  const leave = useCallback((to: LeaveTarget) => {
    bypass.current = true;
    setTarget(null);
    if (to.kind === "back") window.history.go(-2);
    else router.push(to.href);
  }, [router]);

  return { target, cancel: () => setTarget(null), leave };
}

/**
 * Asks what to do with unsaved edits. While an earlier save is still finishing it
 * waits for it; if that leaves nothing unsaved the navigation simply proceeds.
 */
export function LeaveEditorDialog({ target, dirty, saving, isNew, canSave, onSave, onLeave, onCancel }: {
  target: LeaveTarget | null;
  dirty: boolean;
  saving: boolean;
  isNew: boolean;
  canSave: boolean;
  onSave: () => Promise<boolean>;
  onLeave: (target: LeaveTarget) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (target && !dirty && !saving && !busy) onLeave(target); }, [target, dirty, saving, busy, onLeave]);
  const open = !!target && (dirty || saving || busy);
  const cancel = () => { setFailed(false); onCancel(); };
  const save = async () => {
    if (!target) return;
    setBusy(true); setFailed(false);
    // On success nothing is unsaved any more, and the effect above completes the navigation.
    const ok = await onSave();
    setBusy(false);
    if (!ok) setFailed(true);
  };
  return <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) cancel(); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{saving && !dirty ? "Saving your draft…" : "Save your changes?"}</DialogTitle>
        <DialogDescription>
          {saving && !dirty ? "One moment — your latest changes are being saved."
            : isNew ? "This questionnaire hasn't been saved yet. Leaving without saving discards it."
            : "Your most recent edits haven't been saved. Everything saved earlier stays in the draft."}
        </DialogDescription>
      </DialogHeader>
      {!canSave && dirty && <p className="text-sm text-muted-foreground">Name the questionnaire to save it as a draft.</p>}
      {failed && <p className="text-sm text-destructive">The draft couldn&apos;t be saved. Your edits are still here — try again, or keep editing.</p>}
      {(dirty || busy) && <DialogFooter className="sm:justify-between">
        <Button variant="ghost" className="text-destructive" disabled={busy} onClick={() => target && onLeave(target)}>Leave without saving</Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" disabled={busy} onClick={cancel}>Keep editing</Button>
          <Button disabled={busy || !canSave} onClick={() => void save()}>{busy ? "Saving…" : "Save draft and leave"}</Button>
        </div>
      </DialogFooter>}
    </DialogContent>
  </Dialog>;
}
