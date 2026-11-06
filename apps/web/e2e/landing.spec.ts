import { expect, test } from "@playwright/test";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";

test.describe("explore dashboard (landing)", () => {
  test("renders the hero, working CTAs and the supporting sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Celebrate Together. Anywhere.");

    // CTAs lead to the real create / join flows.
    await expect(page.getByTestId("cta-create")).toHaveAttribute("href", "/create");
    await expect(page.getByTestId("cta-join")).toHaveAttribute("href", "/join");
    await expect(page.getByTestId("cta-create")).toHaveText(/Create a Celebration/);
    await expect(page.getByTestId("cta-join")).toHaveText(/Join with a Code/);
    await expect(page.getByRole("link", { name: "World", exact: true })).toHaveAttribute("href", "/world");

    for (const name of ["Explore celebrations", "Create → Share → Celebrate", "Private by default"]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }
  });

  test("create CTA opens the real create flow", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("cta-create").click();
    await expect(page).toHaveURL(/\/create$/);
  });

  test("is honest when no celebration is public: empty state, no fake rooms", async ({ page, request }) => {
    const api = await (await request.get("/api/explore/celebrations")).json();
    // Host opt-in to public discovery exists (discoveryEnabled: true) but nobody has used it on
    // this fresh E2E database, so the live listing is honestly empty — never fabricated rooms.
    expect(api).toMatchObject({ mode: "live", discoveryEnabled: true, celebrations: [] });

    await page.goto("/");
    await expect(page.getByTestId("explore-empty")).toBeVisible();
    await expect(page.getByTestId("explore-empty")).toContainText("No public celebrations yet");
    await expect(page.getByTestId("mode-badge")).toHaveText(/Live/);
    await expect(page.getByTestId("room-card")).toHaveCount(0);
    await expect(page.getByTestId("try-demo")).toBeVisible();
  });

  test("public API never exposes private room data", async ({ request }) => {
    const body = await (await request.get("/api/explore/celebrations?demo=1")).json();
    expect(body.mode).toBe("demo");
    const text = JSON.stringify(body);
    for (const key of [
      "slug",
      "invite",
      "accessCode",
      "access_code",
      "honoree",
      "host",
      "lat",
      "lng",
      "token",
    ]) {
      expect(text).not.toContain(`"${key}`);
    }
    for (const c of body.celebrations) expect(c.participantCount).toBeNull();
  });

  test("demo mode is labelled, filterable and searchable", async ({ page }) => {
    await page.goto("/?demo=1");
    await expect(page.getByTestId("mode-badge")).toHaveText(/Demo celebrations/);
    await expect(page.getByTestId("demo-notice")).toBeVisible();
    await expect(page.getByTestId("results-count")).toHaveText("27 celebrations");
    await expect(page.getByTestId("room-card")).toHaveCount(12);
    await page.getByTestId("show-more").click();
    await expect(page.getByTestId("room-card")).toHaveCount(24);

    await page.getByTestId("filter-region").selectOption("Europe");
    await expect(page.getByTestId("results-count")).toHaveText("6 celebrations");
    await page.getByTestId("filter-country").selectOption("FR");
    await expect(page.getByTestId("room-card")).toHaveCount(1);
    await expect(page.getByTestId("room-card")).toContainText("Parisian Garden Wedding");
    await page.getByTestId("filters-clear").click();

    await page.getByTestId("explore-search").fill("japan");
    await expect(page.getByTestId("room-card")).toHaveCount(2);
    await page.getByTestId("explore-search").fill("");
    await page.getByTestId("filter-language").selectOption("vi");
    await expect(page.getByTestId("room-card")).toHaveCount(2);
    await page.getByTestId("filter-type").selectOption("wedding");
    await expect(page.getByTestId("explore-no-match")).toBeVisible();
    await page.getByTestId("explore-no-match").getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByTestId("results-count")).toHaveText("27 celebrations");
  });

  test("selecting a celebration shows details with an honest next step (keyboard)", async ({ page }) => {
    await page.goto("/?demo=1");
    const card = page.getByTestId("room-card").filter({ hasText: "Sakura Garden Party" });
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(card).toHaveAttribute("aria-pressed", "true");
    const preview = page.getByTestId("room-preview");
    await expect(preview.getByRole("heading", { name: "Sakura Garden Party" })).toBeVisible();
    await expect(preview).toContainText("Japan");
    await expect(preview).toContainText("日本語");
    await expect(preview).toContainText("Demo rooms can't be joined");
    await expect(preview.getByTestId("preview-create")).toHaveAttribute("href", "/create");
    await page.keyboard.press("Escape");
    await expect(preview).toBeHidden();
  });

  test("globe renders, and clicking a real marker opens its preview", async ({ browser }) => {
    // Reduced motion keeps the globe still, so projected marker positions stay valid for the click.
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    await page.goto("/?demo=1");
    const stage = page.getByTestId("globe-stage");
    await expect(stage).toHaveAttribute("data-globe-ready", "true", { timeout: 30_000 });
    await expect(stage.locator("canvas")).toHaveCount(1);
    await expect
      .poll(async () => JSON.parse((await stage.getAttribute("data-markers")) ?? "[]").length, {
        timeout: 10_000,
      })
      .toBeGreaterThan(3);
    const markers: { id: string; n: number; x: number; y: number }[] = JSON.parse(
      (await stage.getAttribute("data-markers")) ?? "[]",
    );
    const box = (await stage.boundingBox())!;
    const target = markers.find(
      (m) => m.n === 1 && m.x > 80 && m.y > 80 && m.x < box.width - 90 && m.y < box.height - 80,
    );
    expect(target, "a single-room marker in view").toBeTruthy();
    await page.mouse.move(box.x + target!.x, box.y + target!.y);
    await page.mouse.click(box.x + target!.x, box.y + target!.y);
    await expect(page.getByTestId("room-preview")).toBeVisible();
    await ctx.close();
  });

  test("respects reduced motion", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/?demo=1");
    await expect(page.getByTestId("globe-stage")).toHaveAttribute("data-globe-ready", "true", {
      timeout: 30_000,
    });
    await expect(page.getByText("Reduced motion is on, so the globe stays still.")).toBeVisible();
    await ctx.close();
  });

  test("without WebGL the list still offers everything", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        value: function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
          if (type.startsWith("webgl")) return null;
          return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
        },
      });
    });
    await page.goto("/?demo=1");
    await expect(page.getByTestId("globe-fallback")).toBeVisible();
    await expect(page.getByTestId("globe-stage").locator("canvas")).toHaveCount(0);
    await page.getByTestId("room-card").first().click();
    await expect(page.getByTestId("room-preview")).toBeVisible();
  });

  test("has no horizontal overflow and no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/?demo=1");
    await expect(page.getByTestId("globe-stage")).toHaveAttribute("data-globe-ready", "true", {
      timeout: 30_000,
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test("switches language and remembers it", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("language-switcher").selectOption("vi");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cùng nhau ăn mừng. Ở bất cứ đâu.");
    await expect(page.getByTestId("cta-create")).toHaveText(/Tạo buổi ăn mừng/);
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
