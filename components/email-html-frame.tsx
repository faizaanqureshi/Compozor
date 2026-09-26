"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";

// Quoted history in replies (Gmail, Apple Mail, Outlook). Hidden by default,
// the way mail clients fold it, with a toggle to show it.
const QUOTE_SELECTOR = [
  ".gmail_quote",
  ".gmail_extra",
  "blockquote[type='cite']",
  "#divRplyFwdMsg",
  "#divRplyFwdMsg ~ *",
  "#appendonsend ~ *",
  ".yahoo_quoted",
].join(", ");

const FRAME_CSS = `
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #122023; overflow-wrap: anywhere; }
  img { max-width: 100%; height: auto; }
  a { color: inherit; }
  body:not(.show-quoted) [data-email-quoted] { display: none !important; }
`;

// Everything interactive or document-level is removed; styles and layout stay.
const PURIFY_CONFIG = {
  WHOLE_DOCUMENT: true,
  FORBID_TAGS: ["script", "iframe", "frame", "object", "embed", "form", "input", "button", "textarea", "select", "meta", "base", "link", "svg", "math", "video", "audio"],
  FORBID_ATTR: ["srcset", "ping", "formaction", "action"],
};

let hooked = false;
function purify(html: string) {
  if (!hooked) {
    // Links leave the app in a new tab, never navigating the frame itself.
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
    hooked = true;
  }
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as unknown as string;
}

function toDocument(sanitized: string) {
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><style>${FRAME_CSS}</style>`;
  return sanitized.includes("<head>")
    ? `<!doctype html>${sanitized.replace("<head>", `<head>${head}`)}`
    : `<!doctype html><html><head>${head}</head><body>${sanitized}</body></html>`;
}

/**
 * Renders the original HTML of an inbound email, as the sender designed it.
 * Loaded lazily and cached per message; shows `fallback` (the plain-text
 * body) if there's no HTML or it can't be loaded.
 */
export function EmailHtmlFrame({
  cacheKey,
  load,
  fallback,
}: {
  cacheKey: readonly unknown[];
  load: () => Promise<{ html: string | null }>;
  fallback: React.ReactNode;
}) {
  const { data, error, isLoading } = useSWR(cacheKey, load, { revalidateOnFocus: false, revalidateIfStale: false, shouldRetryOnError: false });
  const srcDoc = useMemo(() => (data?.html?.trim() ? toDocument(purify(data.html)) : null), [data]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);
  const [height, setHeight] = useState(160);
  const [hasQuote, setHasQuote] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const [plain, setPlain] = useState(false);

  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    doc?.body?.classList.toggle("show-quoted", showQuoted);
  }, [showQuoted]);

  const onLoad = () => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    doc.body.classList.toggle("show-quoted", showQuoted);
    // Gmail wraps forwards in gmail_quote too. The forward is the message,
    // so leave it visible instead of collapsing the entire newsletter.
    const forwarded = /(?:-{2,}\s*Forwarded message|Begin forwarded message:)/i.test(doc.body.textContent ?? "");
    const quotes = forwarded ? [] : Array.from(doc.querySelectorAll(QUOTE_SELECTOR));
    quotes.forEach((quote) => quote.setAttribute("data-email-quoted", ""));
    setHasQuote(quotes.length > 0);
    cleanupRef.current?.();
    // Body height can shrink when quoted history is collapsed; the document's
    // scrollHeight is at least the old iframe height and cannot shrink.
    const measure = () => setHeight(Math.max(60, Math.ceil(doc.body.getBoundingClientRect().height)));
    measure();
    // Images and web fonts load after the first paint; keep the frame fitted.
    const observer = new ResizeObserver(measure);
    observer.observe(doc.body);
    cleanupRef.current = () => observer.disconnect();
  };

  if (error || plain || (data && !srcDoc)) {
    return (
      <div className="flex flex-col gap-2">
        {fallback}
        {!error && srcDoc && (
          <button type="button" onClick={() => setPlain(false)} className="self-start text-xs text-muted-foreground hover:text-foreground">
            Show original formatting
          </button>
        )}
      </div>
    );
  }
  if (isLoading || !srcDoc) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <iframe
        ref={frameRef}
        title="Original email"
        srcDoc={srcDoc}
        onLoad={onLoad}
        // No allow-scripts: nothing in the email can run. Same-origin (safe
        // without scripts) lets the page measure the frame's height.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="w-full rounded-lg bg-card"
        style={{ height }}
      />
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {hasQuote && (
          <button type="button" onClick={() => setShowQuoted((v) => !v)} className="hover:text-foreground">
            {showQuoted ? "Hide quoted text" : "Show quoted text"}
          </button>
        )}
        <button type="button" onClick={() => setPlain(true)} className="hover:text-foreground">
          View as plain text
        </button>
      </div>
    </div>
  );
}
