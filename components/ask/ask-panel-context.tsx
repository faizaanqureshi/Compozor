"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { AskScope } from "@/lib/ask";

// Pages say what they're showing (a client, a workflow, a run, an email
// thread) with useAskScope; the Ask panel scopes itself to the most recent
// one. A tiny external store, so registering from an effect never sets
// React state during render.
function createScopeStore() {
  let entries: { token: number; scope: AskScope }[] = [];
  let next = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => entries.at(-1)?.scope ?? null,
    register(scope: AskScope) {
      const token = ++next;
      entries = [...entries, { token, scope }];
      emit();
      return () => {
        entries = entries.filter((e) => e.token !== token);
        emit();
      };
    },
  };
}

type AskPanelValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Opens the panel and restores the page's scope if it was removed. */
  openForPage: () => void;
  conversationId: number | null;
  setConversationId: (id: number | null) => void;
  scope: AskScope | null;
  dismissScope: () => void;
  store: ReturnType<typeof createScopeStore>;
  /** The full /ask page hosts its own chat; the panel stays out of the way there. */
  available: boolean;
};

const AskPanelContext = createContext<AskPanelValue | null>(null);

export const scopeKey = (scope: AskScope | null) => (scope ? `${scope.kind}:${scope.id}` : "");

export function AskPanelProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [store] = useState(createScopeStore);
  const pageScope = useSyncExternalStore(store.subscribe, store.snapshot, () => null);
  const [openState, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState("");
  const available = !pathname.startsWith("/ask");
  const open = openState && available;

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const openForPage = useCallback(() => {
    setDismissed("");
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && document.activeElement?.closest("[data-ask-panel]")) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scope = pageScope && scopeKey(pageScope) !== dismissed ? pageScope : null;
  const value = useMemo<AskPanelValue>(
    () => ({
      open, setOpen, toggle, openForPage, conversationId, setConversationId, scope,
      dismissScope: () => setDismissed(scopeKey(pageScope)), store, available,
    }),
    [open, toggle, openForPage, conversationId, scope, pageScope, store, available],
  );
  return <AskPanelContext.Provider value={value}>{children}</AskPanelContext.Provider>;
}

export function useAskPanel(): AskPanelValue {
  const value = useContext(AskPanelContext);
  if (!value) throw new Error("useAskPanel must be used inside AskPanelProvider");
  return value;
}

/** Tell Ask what this page is about while it's mounted (null: nothing). */
export function useAskScope(scope: AskScope | null) {
  const context = useContext(AskPanelContext);
  const key = scopeKey(scope);
  const label = scope?.label;
  useEffect(() => {
    if (!context || !scope) return;
    return context.store.register(scope);
    // Re-register only when what it points at changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.store, key, label]);
}
