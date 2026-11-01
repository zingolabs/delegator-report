# delegator-report

Cloudflare Worker (Nitro 2 + h3 + D1) that receives crash reports from the Delegator app and
exposes them to humans (`/view`, `/feed.xml`) and agents (`/queue`, `/triage`).
Prototype-grade: one Worker, one D1, shared tokens, no third-party services.

Read `README.md` for the endpoint contract.

## Layout

- `server/routes/<name>.<method>.ts`: one file per endpoint. Nitro derives the route from the filename.
- `server/utils/env.ts`: bindings, token check, ETag, stack normalize/clean.
- `server/components/ui/`: design system. Imports only preact, clsx, tailwind-merge. Never imports from routes, utils, or sibling components.
- `server/components/`: layout and page components. Routes render them through `html()` in `server/utils/html.ts`.
- `src/app.css`: Tailwind entry and design tokens. Retheme here, not in components.
- `server/utils/reports.ts`: row types, the shared `since`/`limit`/`buildId`/`untriaged` filter and query, batched child-row loaders (`occurrencesFor`, `eventsFor`), and `breakdown`. Add a list param here, never in a route.
- `schema.sql`: the whole schema, for fresh databases. The Worker is deployed, so a schema change also needs `migrations/NNNN-<label>.sql` with the ALTER statements for the remote D1. After a change: `pnpm db:reset:local`, `pnpm schema:snapshot <label>`, `pnpm schema:diff` to derive the migration, then `pnpm erd` and update the diagram in `README.md` and `docs/erd.mmd`.
- `scripts/`: Node-only TypeScript (own `tsconfig.json`, `@types/node`). Never imported by the Worker.
- `wrangler.toml`: bindings and compat date. Secrets (`REPORT_TOKEN`, `READ_TOKEN`, `WRITE_TOKEN`) never go here.

## Rules

- `POST /report` always returns 204. Validation failures, rate limits, and D1 errors are logged and swallowed. Keep it that way.
- Data model: `reports` is the per-fingerprint aggregate and triage state; `occurrences` is one row per received report (first kept forever, then newest 20). Per-report attributes (version, platform, sample) live only in `occurrences`.
- Report fields (`stack`, `message`, `breadcrumbs`, samples) are untrusted. `/queue` is the only shape safe to hand an agent; keep free-text out of it. There is no reporter identity field; provenance is Triage card #2.
- Three roles, three tokens. `REPORT_TOKEN` (header `x-report-token`) may only insert or bump a count; it is extractable from the app, so the create path must stay append-only and `first_sample` is never overwritten. `READ_TOKEN` reads. `WRITE_TOKEN` triages and appends to `triage_events`. A route never accepts a token from a lower role.
- Token checks go through `checkKey` (query `key=`) or `checkReportToken` (header) and return 403, never 404. `/report` stays silent and returns 204 on a bad token.
- ETags come from `versionTag(db, format)`. When a route's output shape or markup changes, bump that route's format constant, or feed readers keep their cached copy.
- HTML routes return `html(event, <Component/>)`. Text goes through JSX children so it is escaped; `dangerouslySetInnerHTML` is never used.
- Compat date in `nitro.config.ts` must stay at or after 2025-08-01. Nitro parses it in local time; at exactly 2025-07-15 dev mode silently loses the Cloudflare bindings proxy.
- Never run `wrangler deploy`, `wrangler d1 create`, `secret put`/`secret bulk`, or any `--remote` script unless the user asks for that deploy. The Worker is live; a deploy is a production change.
- Never commit unless the user asks. Leave work as working-tree changes.

## Development cycle

Run this loop before opening a PR. A step is done when its command exits 0.

1. **Local DB ready.** `cp .dev.vars.example .dev.vars` once, then `pnpm db:reset:local`. Re-run it after any `schema.sql` change.
2. **Dev server red.** `pnpm dev`, reproduce the bug or the missing behaviour with `curl` against `http://localhost:3000`, and see it fail.
3. **Change.** Edit. Stay inside the file that owns the behaviour (see Layout).
4. **Dev server green.** Same `curl`, now passing. For `/view`, `/queue`, `/feed.xml`, `/r/*` also check 403 without the key and 403 with a token from another role; for the JSON and feed routes, 304 with the returned ETag. For a page change, confirm the HTML has zero `<script` tags and that a report containing `<img onerror>` renders escaped.
5. **Worker runtime green.** `pnpm build && pnpm preview`, repeat the key `curl` on `http://localhost:8787`. `nitro dev` runs on Node; this runs on workerd and catches runtime differences.
6. **`pnpm check` green.** Typecheck, oxlint, oxfmt. Fix with `pnpm lint:fix` and `pnpm fmt`.
7. **Docs current.** If the endpoint contract, params, scripts, or schema changed, the matching section of `README.md` says so.
8. **PR.** Draft PR against `main`. Body: what changed, the `curl` commands from step 4 with their output, and the migration file if `schema.sql` changed.

Working tree stays uncommitted until the user asks for a commit.
