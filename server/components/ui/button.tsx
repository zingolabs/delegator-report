import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

/**
 * Classes for anything pressable: a <button>, or an <a> that navigates. Press feedback is a
 * 120ms scale. Colour changes use the default `ease`; only the named properties transition.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border text-sm font-medium whitespace-nowrap select-none " +
    "transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] active:duration-100 " +
    "outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 motion-reduce:active:scale-100",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/85",
        outline: "bg-background text-foreground hover:bg-muted",
        ghost: "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-7 px-2.5 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

export function buttonClass(v?: ButtonVariants, extra?: string): string {
  return cn(buttonVariants(v), extra);
}
