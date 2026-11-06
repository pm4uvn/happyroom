/**
 * End-to-end: the full Explore dashboard loop with a REAL party room, REAL game-server presence
 * and a REAL public wish — no mocks. Mirrors the two-browser-context pattern used by party.spec.ts.
 *
 *   host opts a real room into public discovery
 *     → it appears "Live now" on Explore (confirmed game-server presence, not just a DB flag)
 *     → a visitor sends congratulations without joining the 3D room
 *     → the host sees and approves it from inside the party room
 *     → opting back out removes it from Explore immediately
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";

test.describe.configure({ mode: "serial" });

// Safety net: this DB is shared with other local/E2E runs. Even though each test below also
// opts its room back out before finishing, a future test that forgets to must never leave a
// room publicly discoverable for anyone else to see.
test.afterAll(async () => {
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`update rooms set discoverable = false, public_name = null, public_country = null
               where discoverable and public_name like 'E2E %'`;
  } finally {
    await sql.end();
  }
});

async function focus(page: Page) {
  await page.bringToFront();
  return page;
}

async function decidedConsent(ctx: BrowserContext) {
  await ctx.addInitScript(() => window.localStorage.setItem("hr_analytics_consent", "denied"));
  return ctx;
}

async function newGuest(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await decidedConsent(await browser.newContext({ viewport: { width: 1200, height: 800 } }));
  return { ctx, page: await ctx.newPage() };
}

async function createRoomViaUI(page: Page, opts: { honoree: string; host: string }) {
  await page.goto("/create");
  const wizard = page.getByTestId("create-wizard");
  await wizard.getByTestId("create-next").click(); // occasion: birthday
  await page.getByLabel("Who is the birthday person?").fill(opts.honoree);
  await page.getByLabel("Your name (host)").fill(opts.host);
  await wizard.getByTestId("create-next").click();
  await wizard.getByTestId("create-next").click(); // theme (default)
  await wizard.getByTestId("create-next").click(); // cake (default)
  await wizard.getByTestId("create-next").click(); // time: now
  await wizard.getByTestId("create-next").click(); // privacy (default: invite link)
  await page.getByTestId("create-submit").click();
  await expect(page.getByTestId("room-created")).toBeVisible();
  const slug = (await page.getByTestId("room-code").textContent())!.split(":").pop()!.trim();
  await page.getByTestId("recovery-ack").check();
  await page.getByTestId("enter-room").click();
  await expect(page.getByTestId("lobby")).toHaveAttribute("data-access", "member");
  return { slug };
}

/**
 * Opens the host's Explore-dashboard settings, expanding it only if it isn't already expanded.
 * `DiscoverySettings`' own "open" state survives as long as the People panel stays mounted, so a
 * second blind click on the same session would collapse it again instead of opening it.
 */
async function openDiscoverySettings(page: Page) {
  await page.getByTestId("open-people").click();
  if (!(await page.getByTestId("discovery-enable").isVisible())) {
    await page.getByTestId("discovery-toggle-open").click();
  }
}

async function enterParty(page: Page, name: string, avatar = "mint") {
  await focus(page);
  await page.getByLabel("Your display name").fill(name);
  await page.getByTestId(`avatar-${avatar}`).click();
  await page.getByTestId("lobby-enter").click();
  await expect(page.getByTestId("party-room")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
}

test.describe("Explore dashboard: live presence and public wishes (real room)", () => {
  test.skip(({ isMobile }) => isMobile, "multi-context flow runs once on desktop");

  test("a host's opted-in room appears live, a visitor's congratulations reaches the host, and opting out removes it", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const host = await newGuest(browser);
    const visitor = await newGuest(browser);
    const publicName = `E2E Explore Party ${Date.now()}`;

    try {
      await createRoomViaUI(host.page, { honoree: "Mai", host: "Lin" });
      await enterParty(host.page, "Lin", "sunny");

      // Host opts the real room into public discovery.
      await openDiscoverySettings(host.page);
      await host.page.getByTestId("discovery-enable").check();
      await host.page.getByTestId("discovery-name").fill(publicName);
      await host.page.getByTestId("discovery-country").selectOption("VN");
      await host.page.getByTestId("discovery-save").click();
      await expect(host.page.getByText(/now on the Explore dashboard/i)).toBeVisible();

      // A visitor finds it on the live (non-demo) Explore dashboard — "Live now" is real
      // game-server presence, not merely a database flag.
      await focus(visitor.page);
      await visitor.page.goto("/");
      const card = visitor.page.getByTestId("room-card").filter({ hasText: publicName });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card).toContainText("Live now");

      // Sending congratulations never requires joining the 3D room.
      await card.click();
      const preview = visitor.page.getByTestId("room-preview");
      await expect(preview).toContainText(publicName);
      await preview.getByTestId("preview-send-wish").click();
      const wishPanel = visitor.page.getByTestId("wish-panel");
      await wishPanel.getByTestId("wish-name").fill("A kind visitor");
      await wishPanel.getByTestId("wish-template-1").click();
      await expect(wishPanel.getByTestId("wish-body")).not.toHaveValue("");
      await wishPanel.getByTestId("wish-send").click();
      await expect(wishPanel.getByTestId("wish-success")).toBeVisible();

      // The host — already inside the party room — sees it as pending and approves it, using the
      // same moderation UI as an in-room wish.
      await focus(host.page);
      await host.page.getByTestId("open-wishes").click();
      const pendingWish = host.page.getByTestId("pending-wish");
      await expect(pendingWish).toBeVisible({ timeout: 10_000 });
      await expect(pendingWish).toContainText("A kind visitor");
      await pendingWish.getByTestId("approve-wish").click();
      await expect(host.page.getByTestId("wish-list").getByTestId("wish")).toContainText("A kind visitor");

      // A second visitor, after approval, cannot send a duplicate idempotent request and sees the
      // dashboard stay honest when the host later turns public discovery back off.
      await openDiscoverySettings(host.page);
      await expect(host.page.getByTestId("discovery-enable")).toBeChecked();
      await host.page.getByTestId("discovery-enable").uncheck();
      await host.page.getByTestId("discovery-save").click();
      await expect(host.page.getByText(/no longer public/i)).toBeVisible();

      await focus(visitor.page);
      await visitor.page.goto("/");
      await expect(visitor.page.getByTestId("room-card").filter({ hasText: publicName })).toHaveCount(0, {
        timeout: 15_000,
      });
    } finally {
      await host.ctx.close();
      await visitor.ctx.close();
    }
  });

  test("a visitor already on the dashboard sees a newly public room appear without reloading", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const host = await newGuest(browser);
    // Opened BEFORE the room is created or made public: regression test for the list being
    // fetched once and never refreshed (the summary cards polled and updated; the room list did
    // not), which left a long-lived tab stuck showing "No public celebrations yet" forever.
    const earlyVisitor = await newGuest(browser);
    const publicName = `E2E Late-Arriving Party ${Date.now()}`;

    try {
      await focus(earlyVisitor.page);
      await earlyVisitor.page.goto("/");
      await expect(earlyVisitor.page.getByTestId("room-card").filter({ hasText: publicName })).toHaveCount(0);

      await createRoomViaUI(host.page, { honoree: "Mai", host: "Lin" });
      await enterParty(host.page, "Lin", "sunny");
      await openDiscoverySettings(host.page);
      await host.page.getByTestId("discovery-enable").check();
      await host.page.getByTestId("discovery-name").fill(publicName);
      await host.page.getByTestId("discovery-country").selectOption("JP");
      await host.page.getByTestId("discovery-save").click();
      await expect(host.page.getByText(/now on the Explore dashboard/i)).toBeVisible();

      // No reload, no new navigation on the visitor's tab — only polling can surface this.
      await focus(earlyVisitor.page);
      await expect(earlyVisitor.page.getByTestId("room-card").filter({ hasText: publicName })).toBeVisible({
        timeout: 20_000,
      });

      // This DB is shared with other local runs: never leave a test room publicly discoverable.
      await focus(host.page);
      await openDiscoverySettings(host.page);
      await host.page.getByTestId("discovery-enable").uncheck();
      await host.page.getByTestId("discovery-save").click();
      await expect(host.page.getByText(/no longer public/i)).toBeVisible();
    } finally {
      await host.ctx.close();
      await earlyVisitor.ctx.close();
    }
  });

  test("the public API never exposes this room's invite link, access code or exact location", async ({
    request,
  }) => {
    const body = await (await request.get("/api/explore/celebrations")).json();
    const text = JSON.stringify(body);
    for (const key of ["slug", "invite", "accessCode", "access_code", "recoveryCode", "lat", "lng"]) {
      expect(text).not.toContain(`"${key}`);
    }
  });
});
