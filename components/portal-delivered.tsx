"use client";

// "Ready for you" in the Secure Client Portal: work the firm approved and
// sent. The link alone only says something is waiting; the list and every
// download need the verified portal session. Downloads are one-minute links
// issued per click, so nothing sensitive sits in the page.

import { useCallback, useEffect, useState } from "react";
import { Check, Download, Loader2, MessageCircle } from "lucide-react";
import { Panel } from "@/components/panel";
import { PortalVerification } from "@/components/portal-verification";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  PortalApiError,
  askAboutDelivered,
  getDeliveredFileLink,
  getPortalState,
  isLinkError,
  markDeliveredReviewed,
  type PortalDelivery,
  type PortalState,
} from "@/lib/client-portal-api";

type Phase = "checking" | "locked" | "verifying" | "ready" | "error";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function PortalDelivered({
  token,
  organizationName,
  onState,
  onVerified,
  onLinkInvalid,
}: {
  token: string;
  organizationName?: string;
  onState: (state: PortalState) => void;
  // Verified here: other portal sections can refresh with the same session.
  onVerified: () => void;
  onLinkInvalid: (message: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [items, setItems] = useState<PortalDelivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const firm = organizationName ?? "Your firm";

  const apply = useCallback(
    (state: PortalState) => {
      setItems(state.delivered ?? []);
      onState(state);
      setPhase("ready");
    },
    [onState]
  );

  const refresh = useCallback(
    () =>
      getPortalState(token).then(apply, (e: unknown) => {
        if (isLinkError(e)) onLinkInvalid((e as PortalApiError).message);
        else if (e instanceof PortalApiError && e.status === 401) setPhase("locked");
        else {
          setError(e instanceof PortalApiError ? e.message : "This couldn't be loaded.");
          setPhase("error");
        }
      }),
    [token, apply, onLinkInvalid]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (phase === "ready" && items.length === 0) return null;

  return (
    <Panel title="Ready for you" meta={phase === "ready" ? `From ${firm}` : undefined} className="gap-5 sm:p-6">
      {phase === "checking" && (
        <div className="flex flex-col gap-2" aria-busy>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-9 w-40" />
        </div>
      )}
      {phase === "error" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="self-start" onClick={() => { setPhase("checking"); void refresh(); }}>
            Try again
          </Button>
        </div>
      )}
      {phase === "locked" && (
        <div className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
            {firm} has sent you completed work to review. To keep it private, we&apos;ll first confirm your email
            address with a one-time code.
          </p>
          <Button className="self-start" onClick={() => setPhase("verifying")}>
            View your work
          </Button>
        </div>
      )}
      {phase === "verifying" && (
        <PortalVerification
          token={token}
          organizationName={organizationName}
          onVerified={() => {
            onVerified();
            void refresh();
          }}
          onCancel={() => setPhase("locked")}
          onLinkInvalid={onLinkInvalid}
        />
      )}
      {phase === "ready" && (
        <ul className="flex flex-col">
          {items.map((item) => (
            <DeliveredItem key={item.run_id} token={token} item={item} firm={firm} onState={apply} onLinkInvalid={onLinkInvalid} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function DeliveredItem({
  token,
  item,
  firm,
  onState,
  onLinkInvalid,
}: {
  token: string;
  item: PortalDelivery;
  firm: string;
  onState: (state: PortalState) => void;
  onLinkInvalid: (message: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState(false);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (isLinkError(e)) onLinkInvalid((e as PortalApiError).message);
      else setError(e instanceof PortalApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const download = (fileId: number) =>
    run(`file-${fileId}`, async () => {
      const { url } = await getDeliveredFileLink(token, item.run_id, fileId);
      window.location.assign(url);
    });

  return (
    <li className="flex flex-col gap-3 border-t border-border/60 py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[0.9375rem] font-medium tracking-tight">{item.title}</h3>
        <span className="text-xs text-muted-foreground">Sent {shortDate(item.delivered_at)}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {item.files.map((file) => (
          <li key={file.id}>
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void download(file.id)}>
              {busy === `file-${file.id}` ? <Loader2 className="animate-spin" /> : <Download />}
              {file.filename}
            </Button>
          </li>
        ))}
      </ul>
      {item.reviewed_at && !asked ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4 text-success" />
          You marked this as looking good. Thank you.
        </p>
      ) : asked || (item.questioned_at && !asking) ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageCircle className="size-4" />
          Your question was sent to {firm}. They&apos;ll reply by email.
        </p>
      ) : asking ? (
        <div className="flex max-w-xl flex-col gap-2">
          <Textarea
            aria-label="Your question"
            placeholder={`What would you like to ask ${firm}?`}
            value={question}
            maxLength={4000}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy !== null || !question.trim()}
              onClick={() =>
                void run("ask", async () => {
                  onState(await askAboutDelivered(token, item.run_id, question.trim()));
                  setAsked(true);
                  setAsking(false);
                })
              }
            >
              {busy === "ask" && <Loader2 className="animate-spin" />}
              Send question
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => void run("review", async () => onState(await markDeliveredReviewed(token, item.run_id)))}
          >
            {busy === "review" ? <Loader2 className="animate-spin" /> : <Check />}
            Looks good
          </Button>
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setAsking(true)}>
            I have a question
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}
