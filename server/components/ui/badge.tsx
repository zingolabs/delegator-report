import type { ComponentChildren, HTMLAttributes } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-muted text-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & { children?: ComponentChildren };

export function Badge({ class: c, variant, ...p }: BadgeProps) {
  return <span class={cn(badgeVariants({ variant }), c)} {...p} />;
}
