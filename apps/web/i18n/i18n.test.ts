import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@happyroom/shared";
import en from "../messages/en.json";
import ja from "../messages/ja.json";
import vi from "../messages/vi.json";
import { negotiateLocale } from "./locale";

function keys(obj: unknown, prefix = ""): string[] {
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

function placeholders(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj))
      Object.assign(out, placeholders(v, prefix ? `${prefix}.${k}` : k));
  } else if (typeof obj === "string") {
    out[prefix] = [...obj.matchAll(/\{(\w+)\}/g)]
      .map((m) => m[1])
      .sort()
      .join(",");
  }
  return out;
}

const catalogs = { en, vi, ja } as const;

describe("translation catalogs", () => {
  it("exist for every supported locale", () => {
    expect(Object.keys(catalogs).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it.each(["vi", "ja"] as const)("%s has exactly the same keys as English", (locale) => {
    expect(keys(catalogs[locale]).sort()).toEqual(keys(en).sort());
  });

  it.each(["vi", "ja"] as const)("%s uses the same ICU placeholders as English", (locale) => {
    expect(placeholders(catalogs[locale])).toEqual(placeholders(en));
  });

  it("has no empty strings", () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const [k, v] of Object.entries(placeholders(catalog))) {
        void v;
        const value = k
          .split(".")
          .reduce<unknown>((o, part) => (o as Record<string, unknown>)[part], catalog);
        expect(typeof value === "string" && value.trim().length > 0, `${locale}:${k}`).toBe(true);
      }
    }
  });
});

describe("negotiateLocale", () => {
  it("defaults to English", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("fr-FR,fr;q=0.9")).toBe("en");
  });
  it("honours region subtags and q-values", () => {
    expect(negotiateLocale("vi-VN,vi;q=0.9,en;q=0.8")).toBe("vi");
    expect(negotiateLocale("en;q=0.5,ja;q=0.9")).toBe("ja");
  });
  it("ignores q=0", () => {
    expect(negotiateLocale("ja;q=0,vi;q=0.3")).toBe("vi");
  });
});
