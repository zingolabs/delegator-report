import { defineEventHandler, getQuery } from "h3";
import { useEnv, checkKey } from "../utils/env";
import { readPageFilter, listPage, dayOf, SORT_KEYS } from "../utils/reports";
import { html } from "../utils/html";
import { ReportListPage } from "../components/report-list-page";
import { defineRouteMeta } from "nitropack/runtime";

defineRouteMeta({
  openAPI: {
    tags: ["read"],
    summary: "HTML list of all fingerprints",
    description:
      "The page for humans: newest first, with search, filters, sorting, a 14-day trend for each row " +
      "and a chart of reports per day by app version. All state is query params and plain links. " +
      "Static HTML, no scripts. Each row links to /r/{fingerprint}.",
    parameters: [
      {
        name: "key",
        in: "query",
        required: true,
        schema: { type: "string" },
        description: "READ_TOKEN",
      },
      {
        name: "q",
        in: "query",
        schema: { type: "string" },
        description:
          "at most 200 chars. case-insensitive substring of message, clean stack, fingerprint, build id or note",
      },
      { name: "untriaged", in: "query", schema: { type: "string", enum: ["0", "1"] } },
      {
        name: "triaged",
        in: "query",
        schema: { type: "string", enum: ["0", "1"] },
        description: "ignored when untriaged=1",
      },
      { name: "buildId", in: "query", schema: { type: "string" } },
      {
        name: "version",
        in: "query",
        schema: { type: "string" },
        description: "fingerprints reported on this app version",
      },
      {
        name: "platform",
        in: "query",
        schema: { type: "string" },
        description: "fingerprints reported on this platform; with version, on both at once",
      },
      {
        name: "sort",
        in: "query",
        schema: { type: "string", enum: [...SORT_KEYS], default: "last_seen" },
      },
      {
        name: "dir",
        in: "query",
        schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
      },
      { name: "limit", in: "query", schema: { type: "integer", maximum: 500, default: 100 } },
      {
        name: "since",
        in: "query",
        schema: { type: "integer" },
        description: "unix ms, only rows with lastSeen > since",
      },
    ],
    responses: {
      "200": { description: "text/html" },
      "403": { description: "missing or wrong key" },
    },
  },
});

/** The root. READ_TOKEN, like every other read route. */
export default defineEventHandler(async (event) => {
  const env = useEnv(event);
  if (!checkKey(event, env.READ_TOKEN)) return "forbidden";

  const { filter, sort } = readPageFilter(event);
  const now = Date.now();
  const page = await listPage(env.DB, filter, sort, dayOf(now));
  const key = String(getQuery(event).key ?? "");
  return html(
    event,
    <ReportListPage
      state={{
        key,
        q: filter.q ?? "",
        status: filter.untriaged ? "untriaged" : filter.triaged ? "triaged" : "all",
        buildId: filter.buildId,
        version: filter.version ?? "",
        platform: filter.platform ?? "",
        sort,
        limit: filter.limit,
      }}
      page={page}
      now={now}
      feedHref={`/feed.xml?key=${encodeURIComponent(key)}`}
    />,
  );
});
