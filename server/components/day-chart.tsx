import type { DayCount } from "../utils/reports";
import { DAY_MS } from "../utils/reports";
import { cn } from "./ui";

interface Props {
  /** Cells for the window. Days without a cell are empty. */
  data: DayCount[];
  /** All known versions, newest first. Gives each version its colour. */
  versions: string[];
  /** UTC day number of the last column. */
  today: number;
  days: number;
  class?: string;
}

/** The newest versions get a colour each. The rest fold into one neutral series. */
const COLOURED = 3;
const SERIES = ["bg-series-1", "bg-series-2", "bg-series-3"];
const OLDER = "bg-foreground/25";

const dayLabel = (day: number): string =>
  new Date(day * DAY_MS).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * Reports per UTC day, stacked by app version. Static HTML: the bars are flex boxes, the
 * tooltip is the native `title`. A version keeps its colour when a newer one arrives, because
 * the colour comes from its position in the release order, not from its rank in this chart.
 */
export function DayChart({ data, versions, today, days, class: c }: Props) {
  // Oldest version = 0. Three consecutive positions are always three different colours.
  const position = new Map(versions.map((v, i) => [v, versions.length - 1 - i]));
  const coloured = versions.slice(0, COLOURED);
  const colourOf = (v: string): string =>
    coloured.includes(v) ? SERIES[(position.get(v) ?? 0) % COLOURED]! : OLDER;

  const first = today - days + 1;
  const columns = Array.from({ length: days }, (_, i) => {
    const cells = data.filter((d) => d.day === first + i);
    const older = cells.filter((d) => !coloured.includes(d.version)).reduce((a, d) => a + d.n, 0);
    // Bottom to top: older, then the coloured versions from oldest to newest.
    const parts = [
      { label: "older", n: older, colour: OLDER },
      ...coloured.toReversed().map((v) => ({
        label: v,
        n: cells.filter((d) => d.version === v).reduce((a, d) => a + d.n, 0),
        colour: colourOf(v),
      })),
    ].filter((p) => p.n > 0);
    return { day: first + i, parts, total: parts.reduce((a, p) => a + p.n, 0) };
  });
  const max = Math.max(1, ...columns.map((col) => col.total));
  const total = columns.reduce((a, col) => a + col.total, 0);
  const hasOlder = data.some((d) => !coloured.includes(d.version));
  const legend = [
    ...coloured.filter((v) => data.some((d) => d.version === v)).map((v) => [v, colourOf(v)]),
    ...(hasOlder ? [["older", OLDER]] : []),
  ] as [string, string][];

  return (
    <figure class={cn("flex flex-col gap-3", c)}>
      <figcaption class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span class="font-medium text-foreground">Reports per day</span> · last {days} days, UTC
        </span>
        {legend.length > 1 ? (
          <span class="flex flex-wrap gap-x-3 gap-y-1">
            {legend.map(([label, colour]) => (
              <span class="inline-flex items-center gap-1.5">
                <span class={cn("size-2 rounded-[2px]", colour)} />
                <span class={label === "older" ? undefined : "font-mono"}>{label}</span>
              </span>
            ))}
          </span>
        ) : null}
      </figcaption>
      <div
        class="relative"
        role="img"
        aria-label={`${total.toLocaleString("en-US")} reports in the last ${days} days. Busiest day: ${max.toLocaleString("en-US")}.`}
      >
        <div class="absolute inset-x-0 top-0 border-t border-dashed" />
        <div class="absolute top-0 left-0 -translate-y-1/2 bg-card pr-1.5 text-[10px] leading-none text-muted-foreground tabular-nums">
          {max.toLocaleString("en-US")}
        </div>
        <div class="flex h-28 items-stretch border-b">
          {columns.map((col) => (
            <div
              class="flex min-w-0 flex-1 flex-col justify-end rounded-t-sm transition-colors duration-150 hover:bg-muted"
              title={
                `${dayLabel(col.day)}: ${col.total.toLocaleString("en-US")}` +
                (col.parts.length > 1
                  ? ` (${col.parts
                      .toReversed()
                      .map((p) => `${p.label} ${p.n}`)
                      .join(", ")})`
                  : col.parts[0]
                    ? ` (${col.parts[0].label})`
                    : "")
              }
            >
              {col.total > 0 ? (
                <div
                  class="mx-auto flex w-3/5 max-w-6 min-w-[3px] flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
                  style={{ height: `${Math.max(3, (col.total / max) * 100)}%` }}
                >
                  {col.parts.map((p) => (
                    <div class={cn("min-h-[2px]", p.colour)} style={{ flex: `${p.n} 1 0` }} />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div class="mt-1.5 flex text-[10px] leading-none text-muted-foreground tabular-nums">
          {columns.map((col, i) => (
            <div class="relative h-2.5 min-w-0 flex-1">
              {(days - 1 - i) % 7 === 0 ? (
                <span class="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
                  {dayLabel(col.day)}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

/** A row's reports per day as bars in one quiet tone. The count column carries the magnitude. */
export function Trend({ days }: { days: number[] }) {
  const max = Math.max(1, ...days);
  const total = days.reduce((a, n) => a + n, 0);
  const W = 4;
  const GAP = 2;
  const H = 20;
  return (
    <svg
      width={days.length * (W + GAP) - GAP}
      height={H}
      viewBox={`0 0 ${days.length * (W + GAP) - GAP} ${H}`}
      role="img"
      aria-label={`${total.toLocaleString("en-US")} in the last ${days.length} days`}
      class="block"
    >
      <title>{`${total.toLocaleString("en-US")} in the last ${days.length} days`}</title>
      {days.map((n, i) => {
        const h = n > 0 ? Math.max(2, Math.round((n / max) * H)) : 1;
        return (
          <rect
            x={i * (W + GAP)}
            y={H - h}
            width={W}
            height={h}
            rx={n > 0 ? 1 : 0}
            class={n > 0 ? "fill-foreground/60" : "fill-foreground/15"}
          />
        );
      })}
    </svg>
  );
}
