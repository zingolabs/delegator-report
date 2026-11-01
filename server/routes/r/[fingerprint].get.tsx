import { defineEventHandler, getRouterParam, setResponseStatus, getRequestURL, getQuery } from "h3";
import { useEnv, checkKey } from "../../utils/env";
import { occurrencesFor, eventsFor, type ReportRow } from "../../utils/reports";
import { html } from "../../utils/html";
import { ReportPage } from "../../components/report-page";

/** Per-fingerprint page. READ_TOKEN; the feed's entry links carry it. */
export default defineEventHandler(async (event) => {
  const env = useEnv(event);
  if (!checkKey(event, env.READ_TOKEN)) return "forbidden";

  const fingerprint = getRouterParam(event, "fingerprint") ?? "";
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    setResponseStatus(event, 400);
    return "bad fingerprint";
  }
  const row = await env.DB.prepare("SELECT * FROM reports WHERE fingerprint = ?1")
    .bind(fingerprint)
    .first<ReportRow>();
  if (!row) {
    setResponseStatus(event, 404);
    return "unknown fingerprint";
  }
  const [occ, ev] = await Promise.all([
    occurrencesFor(env.DB, [fingerprint]),
    eventsFor(env.DB, [fingerprint]),
  ]);
  const url = getRequestURL(event);
  const feedHref = `${url.protocol}//${url.host}/feed.xml?key=${encodeURIComponent(String(getQuery(event).key ?? ""))}`;
  return html(
    event,
    <ReportPage
      row={row}
      occurrences={occ.get(fingerprint)}
      events={ev.get(fingerprint)}
      feedHref={feedHref}
    />,
  );
});
