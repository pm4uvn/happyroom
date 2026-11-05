"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@happyroom/ui";

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  visual?: ReactNode;
  disabled?: boolean;
}

/** Accessible card-style single choice (radiogroup with roving focus and arrow-key navigation). */
export function ChoiceGrid<T extends string>({
  label,
  choices,
  value,
  onChange,
  columns = 2,
  name,
}: {
  label: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (v: T) => void;
  columns?: 2 | 3;
  name: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = choices.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0);

  const move = (from: number, dir: number) => {
    const pos = enabled.indexOf(from);
    const next = enabled[(pos + dir + enabled.length) % enabled.length];
    if (next === undefined) return;
    const c = choices[next]!;
    onChange(c.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={`choice-${name}`}
      className={cn(
        "grid gap-3",
        columns === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2",
      )}
    >
      {choices.map((c, i) => {
        const selected = c.value === value;
        return (
          <button
            key={c.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={c.disabled || undefined}
            tabIndex={selected ? 0 : -1}
            disabled={c.disabled}
            onClick={() => !c.disabled && onChange(c.value)}
            onKeyDown={(e) => {
              if (["ArrowRight", "ArrowDown"].includes(e.key)) {
                e.preventDefault();
                move(i, 1);
              } else if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              "flex flex-col items-start gap-2 overflow-hidden rounded-2xl bg-white p-3 text-left ring-1 transition-all",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35",
              selected ? "ring-2 ring-dream shadow-soft" : "ring-line hover:ring-dream-200",
              c.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {c.visual}
            <span className="font-bold text-ink">{c.label}</span>
            {c.description && <span className="text-sm text-ink-soft">{c.description}</span>}
          </button>
        );
      })}
    </div>
  );
}
