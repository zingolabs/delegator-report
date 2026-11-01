import { defineEventHandler, setResponseHeader, getRequestURL, getQuery } from "h3";
import { renderToStaticMarkup } from "preact-render-to-string";
import { useEnv, checkKey, notModified } from "../utils/env";
import {
  readFilter,
  listReports,
  versionTag,
  occurrencesFor,
  eventsFor,
  breakdown,
  parseSample,
} from "../utils/reports";
import { ReportBody } from "../components/report-page";

/** Bump when entry markup/title/summary changes so readers drop their cached copy. */
const FEED_FORMAT = 6;

const esc = (s: unknown): string =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
const iso = (ms: number): string => new Date(ms).toISOString();
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/**
 * Atom feed of crash fingerprints, newest first. Entry id = fingerprint, so a reader
 * notifies once per new crash type. READ_TOKEN. Entry content is the same component as the
 * page, so both carry identical information.
 */
export default defineEventHandler(async (event): Promise<string | null> => {
  const env = useEnv(event);
  if (!checkKey(event, env.READ_TOKEN)) return "forbidden";

  setResponseHeader(event, "content-type", "application/atom+xml; charset=utf-8");
  setResponseHeader(event, "cache-control", "max-age=300");
  if (notModified(event, await versionTag(env.DB, FEED_FORMAT))) return null;

  const f = readFilter(event, 50);
  const rows = await listReports(env.DB, f, "first_seen");
  const fps = rows.map((r) => r.fingerprint);
  const [occByFp, evByFp] = await Promise.all([
    occurrencesFor(env.DB, fps),
    eventsFor(env.DB, fps),
  ]);

  const url = getRequestURL(event);
  const base = `${url.protocol}//${url.host}`;
  const feedId = `${base}/feed.xml`;
  const key = encodeURIComponent(String(getQuery(event).key ?? ""));
  const updated = iso(rows.reduce((m, r) => Math.max(m, r.last_seen), 0) || Date.now());

  const entries = rows.map((r) => {
    const occ = occByFp.get(r.fingerprint) ?? [];
    const b = breakdown(occ);
    const firstFrame = r.stack_clean.split("\n")[0] ?? "";
    const firstStack = parseSample(b.first?.sample).stack;
    const rawFirstLine =
      typeof firstStack === "string" ? (firstStack.split("\n")[0] ?? "").trim() : "";
    const headline = clip(r.message || rawFirstLine || firstFrame || "crash", 120);
    const platforms = Object.keys(b.platforms).join("/") || "unknown";
    const version = b.latest?.version ?? "unknown";
    const title = `[${platforms} ${version}] ${headline} (x${r.count})`;
    const summary = [
      `×${r.count}`,
      `${platforms} ${version}`,
      r.triaged_at ? "triaged" : "untriaged",
      firstFrame,
    ]
      .filter(Boolean)
      .join(" · ");
    const pageUrl = `${base}/r/${r.fingerprint}?key=${key}`;
    const contentHtml =
      `<p><a href="${esc(pageUrl)}">Open full report ↗</a></p>` +
      renderToStaticMarkup(
        <ReportBody row={r} occurrences={occ} events={evByFp.get(r.fingerprint)} />,
      );
    return `  <entry>
    <id>urn:sha256:${r.fingerprint}</id>
    <title>${esc(title)}</title>
    <updated>${iso(r.last_seen)}</updated>
    <published>${iso(r.first_seen)}</published>
    <link href="${esc(pageUrl)}"/>
    <summary>${esc(summary)}</summary>
    <content type="html">${esc(contentHtml)}</content>
  </entry>`;
  });

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${esc(feedId)}</id>
  <title>delegator-report crashes</title>
  <subtitle>Crash fingerprints from the Delegator app, newest first</subtitle>
  <updated>${updated}</updated>
  <author><name>delegator-report</name></author>
  <generator>delegator-report</generator>
  <link rel="self" type="application/atom+xml" href="${esc(feedId)}?key=${esc(key)}"/>
  <link rel="alternate" type="text/html" href="${esc(base)}/"/>
${entries.join("\n")}
</feed>
`;
});
