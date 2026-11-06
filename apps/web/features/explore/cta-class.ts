import { cn } from "@happyroom/ui";

/** Night-theme CTA styles (usable from server and client components). */
export function ctaClass(kind: "primary" | "secondary", size: "md" | "lg" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold transition-[transform,background-color,box-shadow] duration-200",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan/60 active:scale-[0.97]",
    size === "lg" ? "h-13 px-6 text-base" : "h-11 px-5 text-sm",
    kind === "primary"
      ? "bg-amber text-midnight shadow-[0_10px_30px_-10px_rgb(255_200_97/0.6)] hover:-translate-y-0.5 hover:bg-[#ffd47f]"
      : "bg-white/8 text-white ring-1 ring-white/20 hover:-translate-y-0.5 hover:bg-white/14",
  );
}
