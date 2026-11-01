import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { useEnv, checkKey, clip } from "../utils/env";

interface TriageBody {
  fingerprint: string;
  actor?: string;
  prUrl?: string;
  note?: string;
  /** Set to true to clear triage state. The event log keeps the history. */
  reset?: boolean;
}

/** Admin/agent only. Appends a triage_events row and updates the row's current state. */
export default defineEventHandler(async (event) => {
  const env = useEnv(event);
  if (!checkKey(event, env.WRITE_TOKEN)) return "forbidden";

  const raw = (await readBody(event).catch(() => null)) as Partial<TriageBody> | null;
  const fingerprint = typeof raw?.fingerprint === "string" ? raw.fingerprint : "";
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    setResponseStatus(event, 400);
    return { error: "fingerprint must be a 64-char hex sha-256" };
  }

  const now = Date.now();
  const reset = raw?.reset === true;
  const actor = typeof raw?.actor === "string" ? clip(raw.actor, 64) : "unknown";
  const prUrl = typeof raw?.prUrl === "string" ? clip(raw.prUrl, 512) : null;
  const note = typeof raw?.note === "string" ? clip(raw.note, 2000) : null;

  const [update] = await env.DB.batch([
    reset
      ? env.DB.prepare(
          "UPDATE reports SET triaged_at = NULL, pr_url = NULL, note = NULL WHERE fingerprint = ?1",
        ).bind(fingerprint)
      : env.DB.prepare(
          "UPDATE reports SET triaged_at = ?2, pr_url = ?3, note = ?4 WHERE fingerprint = ?1",
        ).bind(fingerprint, now, prUrl, note),
    env.DB.prepare(
      `INSERT INTO triage_events (fingerprint, at, action, actor, pr_url, note)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM reports WHERE fingerprint = ?1)`,
    ).bind(fingerprint, now, reset ? "reset" : "triage", actor, prUrl, note),
  ]);

  if (!update?.meta.changes) {
    setResponseStatus(event, 404);
    return { error: "unknown fingerprint" };
  }
  return { ok: true, fingerprint, triagedAt: reset ? null : now, actor };
});
