import type { HTMLAttributes } from "preact";
import { cn } from "./cn";

type Props = HTMLAttributes<HTMLPreElement> & { code: string };

/** Static <pre>. Text is escaped by the renderer; never pass markup. */
export function CodeBlock({ code, class: c, ...p }: Props) {
  return (
    <pre
      class={cn(
        "overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-5 whitespace-pre-wrap",
        c,
      )}
      {...p}
    >
      {code}
    </pre>
  );
}
