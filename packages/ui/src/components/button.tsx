import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold",
    "transition-[transform,box-shadow,background-color,color] duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
    "[&_svg]:size-[1.15em] [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-dream text-white shadow-soft hover:bg-dream-600 hover:shadow-lift hover:-translate-y-0.5 aria-disabled:hover:translate-y-0",
        party: "bg-pink text-ink shadow-soft hover:bg-pink-600 hover:text-white hover:-translate-y-0.5",
        secondary:
          "bg-surface text-ink ring-1 ring-line shadow-soft hover:ring-dream-200 hover:-translate-y-0.5",
        ghost: "text-ink-soft hover:bg-dream-50 hover:text-ink",
        link: "text-dream-700 underline-offset-4 hover:underline rounded-md",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-[0.95rem]",
        lg: "h-14 px-7 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. a Next.js <Link>) while keeping button styling. */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...(asChild ? {} : { type: type ?? "button" })}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
