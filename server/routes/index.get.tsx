import { defineEventHandler, getQuery } from "h3";
import { useEnv, checkKey } from "../utils/env";
import { readPageFilter, listPage, facets, SORT_KEYS } from "../utils/reports";
import { html } from "../utils/html";
import { ReportListPage } from "../components/report-list-page";
import { defineRouteMeta } from "nitropack/runtime";

defineRouteMeta({
  openAPI: {
    tags: ["read"],
    summary: "HTML list of all fingerprints",
    description:
      "The page for humans: search, filters and sorting, all through query params and plain links. " +
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
        name: "platform",
        in: "query",
        schema: { type: "string" },
        description: "fingerprints with a retained occurrence on this platform",
      },
      {
        name: "sort",
        in: "query",
        schema: { type: "string", enum: [...SORT_KEYS], default: "count" },
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
  const [{ rows, matched }, f] = await Promise.all([
    listPage(env.DB, filter, sort),
    facets(env.DB),
  ]);
  const key = String(getQuery(event).key ?? "");
  return html(
    event,
    <ReportListPage
      state={{
        key,
        q: filter.q ?? "",
        status: filter.untriaged ? "untriaged" : filter.triaged ? "triaged" : "all",
        buildId: filter.buildId,
        platform: filter.platform ?? "",
        sort,
        limit: filter.limit,
      }}
      rows={rows}
      matched={matched}
      facets={f}
      now={Date.now()}
      feedHref={`/feed.xml?key=${encodeURIComponent(key)}`}
    />,
  );
});
