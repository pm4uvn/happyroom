import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-3xl bg-surface/90 p-6 shadow-soft ring-1 ring-line backdrop-blur-sm", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide",
  {
    variants: {
      tone: {
        dream: "bg-dream-100 text-dream-700",
        pink: "bg-pink-100 text-pink-600",
        gold: "bg-gold-100 text-gold-700",
        mint: "bg-mint-100 text-mint-700",
        neutral: "bg-surface text-ink-soft ring-1 ring-line",
      },
    },
    defaultVariants: { tone: "dream" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Content readable by screen readers but visually hidden. */
export function VisuallyHidden({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)] -m-px",
        className,
      )}
      {...props}
    />
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/** Accessible single-select segmented control (radio group semantics). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (index + dir + options.length) % options.length;
    const option = options[next];
    if (option) {
      onChange(option.value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex rounded-full bg-dream-50 p-1 ring-1 ring-line", className)}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35",
              selected ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
