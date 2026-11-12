import type { Occurrence, ReportRow, TriageEvent } from "../utils/reports";
import { breakdown, parseSample } from "../utils/reports";
import { Layout } from "./layout";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CodeBlock,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "./ui";

const iso = (ms: number): string => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

export function reportTitle(row: ReportRow): string {
  return row.message || row.stack_clean.split("\n")[0] || "crash";
}

interface BodyProps {
  row: ReportRow;
  occurrences?: Occurrence[];
  events?: TriageEvent[];
}

interface Props extends BodyProps {
  feedHref?: string;
  /** The list at `/`, with the reader's key. */
  homeHref?: string;
}

/** One fingerprint as a full HTML document. The <link> target of a feed entry. */
export function ReportPage({ row, occurrences, events, feedHref, homeHref }: Props) {
  return (
    <Layout title={`${reportTitle(row)} · delegator-report`} feedHref={feedHref}>
      {homeHref ? (
        <a
          href={homeHref}
          class="-mb-2 self-start text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
        >
          ← All reports
        </a>
      ) : null}
      <ReportBody row={row} occurrences={occurrences} events={events} />
    </Layout>
  );
}

const countsText = (m: Record<string, number>): string =>
  Object.entries(m)
    .toSorted((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ×${n}`)
    .join(", ");

/**
 * The content of one fingerprint, no document shell. Used by the page and, rendered to a
 * string, as the Atom entry content so both carry the same information. Readers strip classes,
 * so the structure must read well unstyled.
 */
export function ReportBody({ row, occurrences = [], events = [] }: BodyProps) {
  const b = breakdown(occurrences);
  const first = parseSample(b.first?.sample);
  const latest = parseSample(b.latest?.sample);
  const breadcrumbs = Array.isArray(first.breadcrumbs) ? (first.breadcrumbs as unknown[]) : [];
  const rawStack = typeof first.stack === "string" ? first.stack : "";
  const latestStack = typeof latest.stack === "string" ? latest.stack : "";
  const latestDiffers =
    b.latest && b.first && b.latest.id !== b.first.id && latestStack !== rawStack;
  const retained = occurrences.length;

  return (
    <>
      <Card>
        <CardHeader>
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant="destructive">×{row.count}</Badge>
            {Object.keys(b.platforms).map((p) => (
              <Badge variant="secondary">{p}</Badge>
            ))}
            {Object.keys(b.versions).map((v) => (
              <Badge variant="outline">{v}</Badge>
            ))}
            {row.triaged_at ? <Badge>triaged</Badge> : <Badge variant="outline">untriaged</Badge>}
          </div>
          <CardTitle class="break-words">{reportTitle(row)}</CardTitle>
          <CardDescription class="font-mono text-xs break-all">{row.fingerprint}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableHead>build</TableHead>
                <TableCell class="font-mono">{row.build_id}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>platforms</TableHead>
                <TableCell>{countsText(b.platforms) || "—"}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>versions</TableHead>
                <TableCell>{countsText(b.versions) || "—"}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>first seen</TableHead>
                <TableCell>{iso(row.first_seen)} UTC</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>last seen</TableHead>
                <TableCell>{iso(row.last_seen)} UTC</TableCell>
              </TableRow>
              {row.triaged_at ? (
                <TableRow>
                  <TableHead>triaged</TableHead>
                  <TableCell>
                    {iso(row.triaged_at)} UTC
                    {row.pr_url ? (
                      <>
                        {" · "}
                        <a class="underline" href={row.pr_url} rel="noreferrer">
                          {row.pr_url}
                        </a>
                      </>
                    ) : null}
                    {row.note ? <div class="text-muted-foreground">{row.note}</div> : null}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stack</CardTitle>
          <CardDescription>Frame-like lines only. Raw stacks below.</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-3">
          <CodeBlock code={row.stack_clean || "(no frames)"} />
          {rawStack ? (
            <details>
              <summary class="cursor-pointer text-sm text-muted-foreground">
                raw stack, first report (untrusted)
              </summary>
              <CodeBlock class="mt-2" code={rawStack} />
            </details>
          ) : null}
          {latestDiffers && latestStack ? (
            <details>
              <summary class="cursor-pointer text-sm text-muted-foreground">
                raw stack, latest report (untrusted)
              </summary>
              <CodeBlock class="mt-2" code={latestStack} />
            </details>
          ) : null}
        </CardContent>
      </Card>

      {breadcrumbs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Breadcrumbs</CardTitle>
            <CardDescription>From the first report. Client-supplied, untrusted.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol class="list-decimal pl-5 text-sm flex flex-col gap-1">
              {breadcrumbs.map((c) => (
                <li>{typeof c === "string" ? c : JSON.stringify(c)}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {retained > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Occurrences</CardTitle>
            <CardDescription>
              {retained} of {row.count} retained: the first and the newest ones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {occurrences.toReversed().map((o) => (
                  <TableRow>
                    <TableCell class="whitespace-nowrap text-muted-foreground">
                      {iso(o.seen_at)} UTC
                    </TableCell>
                    <TableCell>{o.platform}</TableCell>
                    <TableCell>{o.version}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {events.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Triage log</CardTitle>
            <CardDescription>Written by admins and the agent loop, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {events.map((e) => (
                  <TableRow>
                    <TableCell class="whitespace-nowrap text-muted-foreground">
                      {iso(e.at)} UTC
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.action === "reset" ? "outline" : "default"}>
                        {e.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{e.actor}</TableCell>
                    <TableCell class="break-all">
                      {e.pr_url ? (
                        <a class="underline" href={e.pr_url} rel="noreferrer">
                          {e.pr_url}
                        </a>
                      ) : null}
                      {e.note ? <div class="text-muted-foreground">{e.note}</div> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
