// Save/resume coordination for portal questionnaire drafts.
//
// Saves are serialized: one request in flight, always sending the latest
// answers with the last revision the server confirmed. A save is reported as
// successful only after the server confirms it. Conflicts (409) and expired
// sessions (401) stop automatic saving until the client decides what to do;
// the in-memory answers are never discarded by this class.

import { PortalApiError } from "./client-portal-api";
import { canonical, newEntryId, type Answers } from "./questionnaire-logic";

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "invalid" | "conflict" | "unauthorized";

export interface SaverSnapshot {
  status: SaveStatus;
  revision: number;
  savedAt: Date | null;
  message: string | null;
  // The server's current revision after a 409, for an explicit overwrite.
  serverRevision: number | null;
  errorCode: string | null;
}

type SaveFn = (answers: Answers, expectedRevision: number) => Promise<{ draft_revision: number }>;

export class DraftSaver {
  private revision: number;
  private savedFingerprint: string;
  private latest: Answers;
  private loop: Promise<boolean> | null = null;
  private snapshot: SaverSnapshot;

  private readonly saveFn: SaveFn;
  private readonly onChange: (snapshot: SaverSnapshot) => void;

  constructor(
    initial: { revision: number; answers: Answers },
    saveFn: SaveFn,
    onChange: (snapshot: SaverSnapshot) => void = () => {}
  ) {
    this.saveFn = saveFn;
    this.onChange = onChange;
    this.revision = initial.revision;
    this.latest = initial.answers;
    this.savedFingerprint = canonical(initial.answers);
    this.snapshot = { status: "saved", revision: initial.revision, savedAt: null, message: null, serverRevision: null, errorCode: null };
  }

  get state(): SaverSnapshot {
    return this.snapshot;
  }

  get currentRevision(): number {
    return this.revision;
  }

  /** Conflicts and expired sessions need a client decision before saving again. */
  get blocked(): boolean {
    return this.snapshot.status === "conflict" || this.snapshot.status === "unauthorized";
  }

  isDirty(answers: Answers): boolean {
    return canonical(answers) !== this.savedFingerprint;
  }

  private update(patch: Partial<SaverSnapshot>) {
    this.snapshot = { ...this.snapshot, revision: this.revision, ...patch };
    this.onChange(this.snapshot);
  }

  /** Record local edits without saving yet. */
  touch(answers: Answers) {
    this.latest = answers;
    if (this.blocked || this.snapshot.status === "saving") return;
    const dirty = this.isDirty(answers);
    if (dirty && this.snapshot.status !== "dirty") this.update({ status: "dirty" });
    if (!dirty && this.snapshot.status !== "saved" && this.snapshot.status !== "error") this.update({ status: "saved", message: null });
  }

  /** Resolves true only when the answers passed (or later ones) are confirmed saved. */
  save(answers: Answers): Promise<boolean> {
    this.latest = answers;
    if (this.blocked) return Promise.resolve(false);
    if (!this.loop) {
      this.loop = this.run().finally(() => {
        this.loop = null;
      });
    }
    return this.loop;
  }

  /** Waits for any in-flight save. */
  async settle(): Promise<void> {
    while (this.loop) await this.loop;
  }

  private async run(): Promise<boolean> {
    for (;;) {
      const answers = this.latest;
      const fingerprint = canonical(answers);
      if (fingerprint === this.savedFingerprint) {
        if (this.snapshot.status !== "saved") this.update({ status: "saved", message: null, errorCode: null });
        return true;
      }
      this.update({ status: "saving", message: null, errorCode: null });
      try {
        const result = await this.saveFn(answers, this.revision);
        this.revision = result.draft_revision;
        this.savedFingerprint = fingerprint;
        this.update({ savedAt: new Date(), serverRevision: null });
      } catch (error) {
        this.fail(error);
        return false;
      }
    }
  }

  private fail(error: unknown) {
    const e = error instanceof PortalApiError ? error : new PortalApiError(0, "network_error", "The draft could not be saved.");
    if (e.status === 409) {
      const server = typeof e.detail.draft_revision === "number" ? e.detail.draft_revision : null;
      this.update({ status: "conflict", message: e.message, serverRevision: server, errorCode: e.code });
    } else if (e.status === 401) {
      this.update({ status: "unauthorized", message: e.message, errorCode: e.code });
    } else if (e.status === 422 || e.status === 413) {
      this.update({ status: "invalid", message: e.message, errorCode: e.code });
    } else {
      this.update({ status: "error", message: e.message, errorCode: e.code });
    }
  }

  /** The client chose to keep this device's answers over a newer saved draft. */
  overwriteAfterConflict(): Promise<boolean> {
    if (this.snapshot.status !== "conflict" || this.snapshot.serverRevision === null) return Promise.resolve(false);
    this.revision = this.snapshot.serverRevision;
    this.update({ status: "dirty", serverRevision: null, message: null });
    return this.save(this.latest);
  }

  /** Adopt freshly loaded server state (after reload or re-verification). */
  reset(revision: number, answers: Answers) {
    this.revision = revision;
    this.latest = answers;
    this.savedFingerprint = canonical(answers);
    this.update({ status: "saved", serverRevision: null, message: null, errorCode: null });
  }

  /** After re-verification: allow saving the preserved in-memory answers again. */
  resume(): Promise<boolean> {
    if (this.snapshot.status !== "unauthorized") return Promise.resolve(false);
    this.update({ status: "dirty", message: null, errorCode: null });
    return this.save(this.latest);
  }

  /** A submission advanced the revision and cleared the draft on the server. */
  submitted(revision: number, answers: Answers) {
    this.reset(revision, answers);
  }
}

/**
 * One idempotency key per intended submission. Retrying the identical payload
 * (for example after a timeout with an unknown outcome) reuses the key so the
 * server returns the original submission instead of creating another.
 */
export class SubmissionKeys {
  private fingerprint: string | null = null;
  private key: string | null = null;

  keyFor(answers: Answers, expectedRevision: number): string {
    const fingerprint = canonical([answers, expectedRevision]);
    if (fingerprint !== this.fingerprint || this.key === null) {
      this.fingerprint = fingerprint;
      this.key = newEntryId();
    }
    return this.key;
  }

  reset() {
    this.fingerprint = null;
    this.key = null;
  }
}
