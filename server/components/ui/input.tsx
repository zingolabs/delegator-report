import type { InputHTMLAttributes } from "preact";
import { cn } from "./cn";

export function Input({ class: c, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      class={cn(
        "h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground",
        "transition-[border-color,box-shadow] duration-150 focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-foreground/15",
        c,
      )}
      {...p}
    />
  );
}
