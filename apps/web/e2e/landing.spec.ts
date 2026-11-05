import { expect, test } from "@playwright/test";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";

test.describe("landing page", () => {
  test("renders the hero, working CTAs and all sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Celebrate Together. Anywhere.");

    // CTAs lead to the real create / join flows.
    await expect(page.getByTestId("cta-create").first()).toHaveAttribute("href", "/create");
    await expect(page.getByTestId("cta-join").first()).toHaveAttribute("href", "/join");
    await expect(page.getByText("Opening soon")).toHaveCount(0);

    for (const name of [
      "Three steps to a party",
      "Pick the mood",
      "Try the room",
      "Private, safe and kind by design",
    ]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }
  });

  test("has no horizontal overflow at any viewport", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("switches language and remembers it", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("language-switcher").selectOption("vi");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cùng nhau ăn mừng. Ở bất cứ đâu.");
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cùng nhau ăn mừng. Ở bất cứ đâu.");
    await page.getByTestId("language-switcher").selectOption("ja");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("どこにいても、一緒にお祝い。");
  });

  test("negotiates the locale from Accept-Language", async ({ browser }) => {
    const ctx = await browser.newContext({ locale: "ja-JP" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("どこにいても、一緒にお祝い。");
    await ctx.close();
  });

  test("interactive preview: blow out and relight the candles, send an emote, switch theme", async ({
    page,
  }) => {
    await page.goto("/");
    const preview = page.getByTestId("live-preview");
    await expect(preview).toBeVisible();
    // Headless Chromium provides software WebGL, so the 3D scene should mount.
    await expect(preview).toHaveAttribute("data-scene-ready", "true", { timeout: 20_000 });
    await expect(preview.locator("canvas")).toHaveCount(1);

    await preview.getByRole("button", { name: "Blow out the candles" }).click();
    await expect(preview.getByText("Make a wish! 🎉")).toBeVisible();
    await preview.getByRole("button", { name: "Relight the candles" }).click();
    await expect(preview.getByText("Make a wish! 🎉")).toBeHidden();

    await preview.getByRole("button", { name: "Dance" }).click();

    const sunny = preview.getByRole("radio", { name: "Sunny Garden" });
    await sunny.click();
    await expect(sunny).toHaveAttribute("aria-checked", "true");
  });

  test("theme cards drive the preview", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("button", { name: "Preview in 3D" });
    await card.click();
    await expect(
      page.getByTestId("live-preview").getByRole("radio", { name: "Sunny Garden" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("respects reduced motion", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByText("Reduced motion is on, so the preview stays still.")).toBeVisible();
    await ctx.close();
  });

  test("share panel offers a copyable link and a QR code", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are Chromium-specific");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    const url = await page.getByTestId("share-url").inputValue();
    expect(url).toMatch(/^http:\/\/localhost:\d+$/);
    await page.getByTestId("share-copy").click();
    await expect(page.getByTestId("share-copy")).toHaveText(/Link copied/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    await expect(page.getByTestId("share-qr")).toHaveAttribute("src", /^data:image\/png;base64,/);
  });

  test("consent banner can be declined and reopened from the footer", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByTestId("consent-banner");
    await expect(banner).toBeVisible({ timeout: 5000 });
    await banner.getByRole("button", { name: "No thanks" }).click();
    await expect(banner).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("hr_anon_id"))).toBeNull();
    await page.getByRole("button", { name: "Analytics settings" }).click();
    await expect(banner).toBeVisible();
  });
});

test.describe("platform", () => {
  test("health endpoint reports the database", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", service: "web", checks: { database: "ok" } });
  });

  test("security and privacy headers are set", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["permissions-policy"]).toContain("camera=()");
    expect(res.headers()["x-powered-by"]).toBeUndefined();
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /r/");
  });

  test("analytics ingestion stores valid events and drops PII-bearing ones", async ({ request }) => {
    const sql = postgres(DATABASE_URL, { max: 1 });
    try {
      const marker = `e2e-${Date.now()}.example`;
      const now = new Date().toISOString();
      const res = await request.post("/api/events", {
        data: {
          events: [
            { name: "landing_view", occurredAt: now, properties: { referrerDomain: marker } },
            { name: "landing_view", occurredAt: now, properties: { email: "someone@example.com" } },
            { name: "not_an_event", occurredAt: now, properties: {} },
          ],
        },
      });
      expect(res.status()).toBe(202);
      expect(await res.json()).toEqual({ accepted: 1, rejected: 2 });
      const rows =
        await sql`select properties from analytics_events where properties->>'referrerDomain' = ${marker}`;
      expect(rows).toHaveLength(1);
      const leaked = await sql`select count(*)::int as n from analytics_events where properties ? 'email'`;
      expect(leaked[0]!.n).toBe(0);
    } finally {
      await sql.end();
    }
  });

  test("rejects malformed analytics payloads", async ({ request }) => {
    expect(
      (
        await request.post("/api/events", {
          data: "not json",
          headers: { "content-type": "application/json" },
        })
      ).status(),
    ).toBe(400);
    expect((await request.post("/api/events", { data: { events: [] } })).status()).toBe(400);
  });

  test("a page view records landing_view in the database", async ({ page }) => {
    const sql = postgres(DATABASE_URL, { max: 1 });
    try {
      const before: number = (
        await sql`select count(*)::int as n from analytics_events where event_name = 'landing_view'`
      )[0]!.n;
      await page.goto("/");
      await expect
        .poll(
          async () =>
            (await sql`select count(*)::int as n from analytics_events where event_name = 'landing_view'`)[0]!
              .n,
          {
            timeout: 10_000,
          },
        )
        .toBeGreaterThan(before);
    } finally {
      await sql.end();
    }
  });
});
