import type { ComponentChildren } from "preact";
import type { ListPage, ListSort, SortKey } from "../utils/reports";
import { PAGE_LIMIT, MAX_LIMIT, CHART_DAYS, dayOf } from "../utils/reports";
import { DayChart, Trend } from "./day-chart";
import { Layout } from "./layout";
import { reportTitle } from "./report-page";
import {
  Badge,
  Card,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  buttonClass,
  cn,
} from "./ui";

export type Status = "all" | "untriaged" | "triaged";

/** Everything the URL carries. Each link on the page is this state with one field changed. */
export interface ListState {
  key: string;
  q: string;
  status: Status;
  buildId: string;
  version: string;
  platform: string;
  sort: ListSort;
  limit: number;
}

interface Props {
  state: ListState;
  page: ListPage;
  now: number;
  feedHref: string;
}

/** Version chips shown. Older versions stay reachable through the URL and the search. */
const MAX_VERSION_CHIPS = 6;

/** Rows that get their own view-transition name. More than this and a re-sort just cross-fades. */
const MAX_MOVING_ROWS = 60;

/** Query pairs for a state, defaults left out so the URLs stay short. `key` always comes first. */
function params(s: ListState): [string, string][] {
  const p: [string, string][] = [["key", s.key]];
  if (s.q) p.push(["q", s.q]);
  if (s.status !== "all") p.push([s.status, "1"]);
  if (s.buildId) p.push(["buildId", s.buildId]);
  if (s.version) p.push(["version", s.version]);
  if (s.platform) p.push(["platform", s.platform]);
  if (s.sort.key !== "last_seen") p.push(["sort", s.sort.key]);
  if (s.sort.dir !== "desc") p.push(["dir", s.sort.dir]);
  if (s.limit !== PAGE_LIMIT) p.push(["limit", String(s.limit)]);
  return p;
}

const hrefOf = (s: ListState): string => "/?" + new URLSearchParams(params(s)).toString();

const OS_NAMES: Record<string, string> = { ios: "iOS", android: "Android" };
const osName = (os: string): string => OS_NAMES[os] ?? os;

const num = (n: number): string => n.toLocaleString("en-US");
const plural = (n: number, one: string): string => `${num(n)} ${one}${n === 1 ? "" : "s"}`;
const iso = (ms: number): string => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

function ago(ms: number, now: number): string {
  const s = Math.max(0, now - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  if (s < 86400 * 365) return `${Math.floor(s / (86400 * 30))}mo ago`;
  return `${Math.floor(s / (86400 * 365))}y ago`;
}

function When({ ms, now }: { ms: number; now: number }) {
  return (
    <time dateTime={new Date(ms).toISOString()} title={`${iso(ms)} UTC`}>
      {ago(ms, now)}
    </time>
  );
}

function SearchIcon() {
  return (
    <svg
      class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function SortArrow({ dir }: { dir: "asc" | "desc" }) {
  return (
    <svg
      class={cn("size-3", dir === "asc" && "rotate-180")}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M6 2.5v7M3 6.5l3 3 3-3" />
    </svg>
  );
}

interface Choice {
  label: string;
  href: string;
  active: boolean;
  mono?: boolean;
}

/**
 * One row of filter links. The active one sits on a pill that has a view-transition name, so
 * on the next page it slides to the new choice instead of jumping.
 */
function FilterGroup({ name, label, choices }: { name: string; label: string; choices: Choice[] }) {
  return (
    <div class="flex items-baseline gap-3">
      <div class="w-16 shrink-0 text-xs font-medium text-muted-foreground" id={`f-${name}`}>
        {label}
      </div>
      <div class="flex flex-wrap gap-1" role="group" aria-labelledby={`f-${name}`}>
        {choices.map((c) => (
          <a
            href={c.href}
            aria-current={c.active ? "true" : undefined}
            class={buttonClass(
              { variant: "ghost", size: "sm" },
              cn("relative", c.active && "text-foreground", c.mono && "font-mono"),
            )}
          >
            {c.active ? (
              <span
                class="vt-pill absolute inset-0 rounded-md bg-foreground/10"
                style={{ viewTransitionName: `pill-${name}` }}
              />
            ) : null}
            <span class="relative">{c.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function SortHead({
  state,
  col,
  class: c,
  children,
}: {
  state: ListState;
  col: SortKey;
  class?: string;
  children: ComponentChildren;
}) {
  const active = state.sort.key === col;
  // A new column starts at its useful end (most, newest). The active column flips.
  const dir = active && state.sort.dir === "desc" ? "asc" : "desc";
  return (
    <TableHead
      class={c}
      aria-sort={active ? (state.sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <a
        href={hrefOf({ ...state, sort: { key: col, dir } })}
        class={cn(
          "-mx-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 outline-none select-none",
          "transition-[transform,background-color,color] duration-150 ease-out hover:bg-muted hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-foreground/30 active:scale-[0.97] active:duration-100 motion-reduce:active:scale-100",
          active && "text-foreground",
        )}
      >
        {children}
        {active ? <SortArrow dir={state.sort.dir} /> : <span class="size-3" />}
      </a>
    </TableHead>
  );
}

/** The root page: every fingerprint, newest first, with search, filters, sorting and trends. No scripts. */
export function ReportListPage({ state, page, now, feedHref }: Props) {
  const { rows, matched } = page;
  const today = dayOf(now);
  const latest = page.versions[0];
  const filtered = !!(
    state.q ||
    state.status !== "all" ||
    state.buildId ||
    state.version ||
    state.platform
  );
  const cleared: ListState = {
    ...state,
    q: "",
    status: "all",
    buildId: "",
    version: "",
    platform: "",
  };
  const chips = page.versions.slice(0, MAX_VERSION_CHIPS);
  const versions =
    chips.includes(state.version) || !state.version ? chips : [state.version, ...chips];
  const platforms =
    page.platforms.includes(state.platform) || !state.platform
      ? page.platforms
      : [state.platform, ...page.platforms];
  // The search form resubmits the rest of the state through hidden fields.
  const hidden = params({ ...state, q: "" });

  return (
    <Layout title="Crash reports · delegator-report" feedHref={feedHref} wide>
      <h1 class="text-2xl font-semibold tracking-tight">Crash reports</h1>

      <Card class="flex flex-col gap-4 p-4">
        <form method="get" action="/" role="search" class="flex gap-2">
          {hidden.map(([name, value]) => (
            <input type="hidden" name={name} value={value} />
          ))}
          <div class="relative min-w-0 flex-1">
            <SearchIcon />
            <Input
              type="search"
              name="q"
              value={state.q}
              class="pl-9"
              placeholder="Search"
              aria-label="Search reports"
              autocomplete="off"
              spellcheck={false}
              maxLength={200}
            />
          </div>
        </form>

        <div class="flex flex-col gap-2">
          <FilterGroup
            name="status"
            label="Status"
            choices={(["all", "untriaged", "triaged"] as const).map((s) => ({
              label: s.charAt(0).toUpperCase() + s.slice(1),
              href: hrefOf({ ...state, status: s }),
              active: state.status === s,
            }))}
          />
          {versions.length > 0 ? (
            <FilterGroup
              name="version"
              label="Version"
              choices={[
                { label: "All", href: hrefOf({ ...state, version: "" }), active: !state.version },
                ...versions.map((v) => ({
                  label: v,
                  href: hrefOf({ ...state, version: v }),
                  active: state.version === v,
                  mono: true,
                })),
              ]}
            />
          ) : null}
          {platforms.length > 0 ? (
            <FilterGroup
              name="platform"
              label="Platform"
              choices={[
                { label: "All", href: hrefOf({ ...state, platform: "" }), active: !state.platform },
                ...platforms.map((p) => ({
                  label: osName(p),
                  href: hrefOf({ ...state, platform: p }),
                  active: state.platform === p,
                })),
              ]}
            />
          ) : null}
        </div>
      </Card>

      {page.chart.length > 0 ? (
        <Card class="p-4">
          <DayChart data={page.chart} versions={page.versions} today={today} days={CHART_DAYS} />
        </Card>
      ) : null}

      <div class="flex min-h-7 items-center justify-between gap-4 text-sm text-muted-foreground">
        <p class="tabular-nums">
          {matched === 0
            ? "No reports"
            : rows.length < matched
              ? `First ${num(rows.length)} of ${plural(matched, "fingerprint")}`
              : plural(matched, "fingerprint")}
          {state.q ? (
            <>
              {" for "}
              <span class="text-foreground">“{state.q}”</span>
            </>
          ) : null}
        </p>
        {filtered ? (
          <a class={buttonClass({ variant: "outline", size: "sm" })} href={hrefOf(cleared)}>
            Clear filters
          </a>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <Card class="flex flex-col items-center gap-1 px-6 py-16 text-center">
          <div class="font-medium">
            {filtered ? "No reports match these filters" : "No crash reports yet"}
          </div>
        </Card>
      ) : (
        <Card class="overflow-hidden">
          <Table>
            <thead class="border-b bg-muted/40">
              <tr>
                <SortHead state={state} col="last_seen" class="pl-4">
                  Last seen
                </SortHead>
                <TableHead>Report</TableHead>
                <TableHead class="hidden md:table-cell">Version</TableHead>
                <TableHead class="hidden md:table-cell">Platform</TableHead>
                <TableHead class="hidden lg:table-cell">14 days</TableHead>
                <SortHead state={state} col="count" class="pr-4 sm:pr-2">
                  Count
                </SortHead>
                <TableHead class="hidden pr-4 sm:table-cell">Status</TableHead>
              </tr>
            </thead>
            <TableBody>
              {rows.map((r, i) => {
                const status = r.triaged_at ? (
                  <Badge>triaged</Badge>
                ) : (
                  <Badge variant="outline">untriaged</Badge>
                );
                const vs = page.versionsOf.get(r.fingerprint) ?? [];
                const ps = page.platformsOf.get(r.fingerprint) ?? [];
                const trend = page.trends.get(r.fingerprint);
                return (
                  <TableRow
                    class="vt-row transition-colors duration-150 hover:bg-muted/50"
                    style={
                      i < MAX_MOVING_ROWS
                        ? { viewTransitionName: `r-${r.fingerprint.slice(0, 16)}` }
                        : undefined
                    }
                  >
                    <TableCell class="pl-4 whitespace-nowrap text-muted-foreground tabular-nums">
                      <When ms={r.last_seen} now={now} />
                    </TableCell>
                    <TableCell class="w-full max-w-0 py-2.5">
                      <a
                        href={`/r/${r.fingerprint}?key=${encodeURIComponent(state.key)}`}
                        class="line-clamp-2 rounded-sm font-medium wrap-anywhere underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-foreground/30 sm:line-clamp-1"
                      >
                        {reportTitle(r)}
                      </a>
                      <div class="mt-1.5 sm:hidden">{status}</div>
                    </TableCell>
                    <TableCell class="hidden font-mono text-xs whitespace-nowrap md:table-cell">
                      {vs[0] ? (
                        // The newest release this crash was seen on. The latest one stands out.
                        <span class={vs[0] === latest ? undefined : "text-muted-foreground"}>
                          {vs[0]}
                        </span>
                      ) : null}
                      {vs.length > 1 ? (
                        <span class="text-muted-foreground" title={vs.join(", ")}>
                          {" "}
                          +{vs.length - 1}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell class="hidden text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                      {ps.map(osName).join(", ")}
                    </TableCell>
                    <TableCell class="hidden lg:table-cell">
                      {trend ? <Trend days={trend} /> : null}
                    </TableCell>
                    <TableCell class="pr-4 font-semibold tabular-nums sm:pr-2">
                      {num(r.count)}
                    </TableCell>
                    <TableCell class="hidden pr-4 sm:table-cell">{status}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {rows.length < matched ? (
        <p class="text-center text-sm text-muted-foreground">
          {state.limit < MAX_LIMIT ? (
            <a
              class={buttonClass({ variant: "outline", size: "sm" })}
              href={hrefOf({ ...state, limit: MAX_LIMIT })}
            >
              Show up to {MAX_LIMIT}
            </a>
          ) : (
            "Narrow the filters to see the rest."
          )}
        </p>
      ) : null}
    </Layout>
  );
}
