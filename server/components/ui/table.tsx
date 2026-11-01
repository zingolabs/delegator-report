import type { ComponentChildren, HTMLAttributes } from "preact";
import { cn } from "./cn";

type P<T extends EventTarget> = HTMLAttributes<T> & { children?: ComponentChildren };

export function Table({ class: c, ...p }: P<HTMLTableElement>) {
  return (
    <div class="relative w-full overflow-x-auto">
      <table class={cn("w-full caption-bottom text-sm", c)} {...p} />
    </div>
  );
}
export function TableBody({ class: c, ...p }: P<HTMLTableSectionElement>) {
  return <tbody class={cn("[&_tr:last-child]:border-0", c)} {...p} />;
}
export function TableRow({ class: c, ...p }: P<HTMLTableRowElement>) {
  return <tr class={cn("border-b", c)} {...p} />;
}
export function TableHead({ class: c, ...p }: P<HTMLTableCellElement>) {
  return (
    <th
      class={cn(
        "h-9 px-2 text-left align-middle font-medium whitespace-nowrap text-muted-foreground",
        c,
      )}
      {...p}
    />
  );
}
export function TableCell({ class: c, ...p }: P<HTMLTableCellElement>) {
  return <td class={cn("p-2 align-middle", c)} {...p} />;
}
