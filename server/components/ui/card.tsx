import type { ComponentChildren, HTMLAttributes } from "preact";
import { cn } from "./cn";

type DivProps = HTMLAttributes<HTMLDivElement> & { children?: ComponentChildren };

export function Card({ class: c, ...p }: DivProps) {
  return <div class={cn("rounded-lg border bg-card text-card-foreground shadow-sm", c)} {...p} />;
}
export function CardHeader({ class: c, ...p }: DivProps) {
  return <div class={cn("flex flex-col gap-1.5 p-6", c)} {...p} />;
}
export function CardTitle({ class: c, ...p }: DivProps) {
  return <div class={cn("text-lg leading-none font-semibold", c)} {...p} />;
}
export function CardDescription({ class: c, ...p }: DivProps) {
  return <div class={cn("text-sm text-muted-foreground", c)} {...p} />;
}
export function CardContent({ class: c, ...p }: DivProps) {
  return <div class={cn("p-6 pt-0", c)} {...p} />;
}
