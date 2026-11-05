/**
 * End-to-end multiplayer tests: real Next.js server + real Colyseus game server + real PostgreSQL,
 * driven through two independent browser contexts (separate cookies = separate guests). No mocks.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";

test.describe.configure({ mode: "serial" });

async function createRoomViaUI(page: Page, opts: { honoree: string; host: string; accessCode?: string }) {
  await page.goto("/create");
  const wizard = page.getByTestId("create-wizard");
  await wizard.getByTestId("create-next").click(); // occasion: birthday
  await page.getByLabel("Who is the birthday person?").fill(opts.honoree);
  await page.getByLabel("Your name (host)").fill(opts.host);
  await wizard.getByTestId("create-next").click();
  await wizard.getByTestId("create-next").click(); // theme (default)
  await wizard.getByTestId("create-next").click(); // cake (default)
  await wizard.getByTestId("create-next").click(); // time: now
  if (opts.accessCode) {
    await page.getByRole("radio", { name: /access code/i }).click();
    await page.getByLabel("Access code (4–12 letters or digits)").fill(opts.accessCode);
  }
  await wizard.getByTestId("create-next").click(); // privacy
  await page.getByTestId("create-submit").click();
  await expect(page.getByTestId("room-created")).toBeVisible();
  const inviteUrl = await page.getByTestId("share-url").inputValue();
  const recoveryCode = (await page.getByTestId("recovery-code").textContent())!.trim();
  const code = (await page.getByTestId("room-code").textContent())!.split(":").pop()!.trim();
  return { inviteUrl, recoveryCode, slug: code };
}

async function enterParty(page: Page, name?: string, avatar = "mint") {
  await focus(page);
  if (name !== undefined) await page.getByLabel("Your display name").fill(name);
  await page.getByTestId(`avatar-${avatar}`).click();
  await page.getByTestId("lobby-enter").click();
  await expect(page.getByTestId("party-room")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
}

/**
 * Headless Chromium throttles requestAnimationFrame in background pages, and Playwright's
 * actionability checks rely on rAF. Real users each have their own foreground browser, so bring
 * the page we're acting on to the front first.
 */
async function focus(page: Page) {
  await page.bringToFront();
  return page;
}

async function people(page: Page) {
  await focus(page);
  if (!(await page.getByTestId("panel-people").isVisible())) await page.getByTestId("open-people").click();
  return page.getByTestId("person");
}

async function positionOf(page: Page, name: string) {
  const el = page.locator(`[data-testid="person"][data-name="${name}"]`);
  return { x: Number(await el.getAttribute("data-x")), z: Number(await el.getAttribute("data-z")) };
}

/** A returning visitor who already answered the analytics prompt (the banner is covered by landing.spec). */
async function decidedConsent(ctx: BrowserContext) {
  await ctx.addInitScript(() => window.localStorage.setItem("hr_analytics_consent", "denied"));
  return ctx;
}

async function newGuest(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await decidedConsent(await browser.newContext({ viewport: { width: 1100, height: 760 } }));
  return { ctx, page: await ctx.newPage() };
}

test.describe("create → invite → join → play", () => {
  test.skip(({ isMobile }) => isMobile, "multi-context flow runs once on desktop");

  let host: { ctx: BrowserContext; page: Page };
  let guest: { ctx: BrowserContext; page: Page };
  let room: { inviteUrl: string; recoveryCode: string; slug: string };
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });

  test.beforeAll(async ({ browser }) => {
    host = await newGuest(browser);
    guest = await newGuest(browser);
  });

  test.afterAll(async () => {
    await host.ctx.close();
    await guest.ctx.close();
    await sql.end();
  });

  test("host creates a real room (persisted, with invite link and recovery code)", async () => {
    room = await createRoomViaUI(host.page, { honoree: "Mai Nguyễn", host: "Sang" });
    expect(room.inviteUrl).toMatch(/\/r\/[a-z0-9]{8}\?i=[A-Za-z0-9_-]{40,}$/);
    expect(room.recoveryCode).toMatch(/^HR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const [row] = await sql`select r.honoree_name, r.privacy, p.role, p.display_name,
                                   (select count(*)::int from invitations i where i.room_id = r.id) as invites
                              from rooms r join room_participants p on p.room_id = r.id where r.slug = ${room.slug}`;
    expect(row).toMatchObject({
      honoree_name: "Mai Nguyễn",
      privacy: "invite_link",
      role: "host",
      display_name: "Sang",
      invites: 1,
    });
    // Secrets are only stored hashed.
    const [inv] =
      await sql`select octet_length(token_hash) as len from invitations i join rooms r on r.id = i.room_id where r.slug = ${room.slug}`;
    expect(inv!.len).toBe(32);
  });

  test("host enters the party", async () => {
    await focus(host.page);
    await host.page.getByTestId("recovery-ack").check();
    await focus(host.page);
    await host.page.getByTestId("enter-room").click();
    await expect(host.page.getByTestId("lobby")).toHaveAttribute("data-access", "member");
    await enterParty(host.page, undefined, "sunny");
    await expect(host.page.getByTestId("party-title")).toHaveText("Mai Nguyễn's birthday");
  });

  test("the room code alone does not let a stranger in", async ({ browser }) => {
    const stranger = await newGuest(browser);
    await stranger.page.goto(`/r/${room.slug}`);
    await expect(stranger.page.getByTestId("lobby")).toHaveAttribute("data-access", "invite_required");
    await expect(stranger.page.getByText("Mai Nguyễn")).toHaveCount(0); // honoree hidden
    const res = await stranger.page.request.post(`/api/rooms/${room.slug}/join`, {
      data: { displayName: "Eve", avatarPreset: "plum" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("invitation_required");
    const forged = await stranger.page.request.post(`/api/rooms/${room.slug}/join`, {
      data: { displayName: "Eve", avatarPreset: "plum", invitationToken: "x".repeat(43) },
    });
    expect((await forged.json()).error).toBe("invalid_invitation");
    // Guests cannot mint invitations either.
    const mint = await stranger.page.request.post(`/api/rooms/${room.slug}/invitations`, { data: {} });
    expect(mint.status()).toBe(403);
    await stranger.ctx.close();
  });

  test("a guest joins from the invite link and both see two avatars in real time", async () => {
    await guest.page.goto(room.inviteUrl);
    await expect(guest.page.getByTestId("lobby")).toHaveAttribute("data-access", "invited");
    await enterParty(guest.page, "Linh", "berry");
    await expect(guest.page.getByTestId("online-count")).toHaveAttribute("data-count", "2");
    await expect(host.page.getByTestId("online-count")).toHaveAttribute("data-count", "2");
    await expect(await people(host.page)).toHaveCount(2);
    await expect(await people(guest.page)).toHaveCount(2);
    // Token is removed from the address bar after use.
    expect(guest.page.url()).not.toContain("?i=");
    const [p] = await sql`select p.role, p.invitation_id is not null as attributed from room_participants p
                           join rooms r on r.id = p.room_id where r.slug = ${room.slug} and p.display_name = 'Linh'`;
    expect(p).toMatchObject({ role: "guest", attributed: true });
  });

  test("simultaneous movement is synchronised across browsers", async () => {
    await people(host.page);
    await people(guest.page);
    const hostStart = await positionOf(guest.page, "Sang");
    const guestStart = await positionOf(host.page, "Linh");
    // Close panels' focus traps: click the canvas area so keys go to the window.
    await focus(host.page);
    await host.page.mouse.click(400, 300);
    await focus(guest.page);
    await guest.page.mouse.click(400, 300);
    await Promise.all([host.page.keyboard.down("KeyA"), guest.page.keyboard.down("KeyD")]);
    await host.page.waitForTimeout(1200);
    await Promise.all([host.page.keyboard.up("KeyA"), guest.page.keyboard.up("KeyD")]);
    // Each browser sees the *other* participant's authoritative position change.
    await expect
      .poll(async () => {
        const h = await positionOf(guest.page, "Sang");
        return Math.hypot(h.x - hostStart.x, h.z - hostStart.z);
      })
      .toBeGreaterThan(1);
    await expect
      .poll(async () => {
        const g = await positionOf(host.page, "Linh");
        return Math.hypot(g.x - guestStart.x, g.z - guestStart.z);
      })
      .toBeGreaterThan(1);
  });

  test("emotes are broadcast", async () => {
    await focus(guest.page);
    await guest.page.getByTestId("emote-dance").click();
    await expect(host.page.locator("text=💃").first()).toBeVisible();
  });

  test("a guest cannot start the ceremony; the host can, and everyone shares the candle moment", async () => {
    await expect(guest.page.getByTestId("ceremony-start")).toHaveCount(0);
    await focus(host.page);
    await host.page.getByTestId("ceremony-start").click();
    await expect(host.page.getByTestId("party-room")).toHaveAttribute("data-phase", "PREPARING");
    // PREPARING lasts 4 s; on a slow machine the guest may already be in COUNTDOWN when checked.
    await expect(guest.page.getByTestId("party-room")).toHaveAttribute("data-phase", /PREPARING|COUNTDOWN/);
    await expect(guest.page.getByTestId("party-room")).toHaveAttribute("data-phase", "COUNTDOWN", {
      timeout: 10_000,
    });
    // After the synchronized countdown both get the blow action; the guest blows.
    await expect(guest.page.getByTestId("blow-candles")).toBeVisible({ timeout: 10_000 });
    await expect(host.page.getByTestId("blow-candles")).toBeVisible();
    await focus(guest.page);
    await guest.page.getByTestId("blow-candles").click();
    await expect(host.page.getByTestId("ceremony-banner")).toContainText("Linh blew out the candles!");
    await expect(guest.page.getByTestId("party-room")).toHaveAttribute(
      "data-phase",
      /CANDLES_OUT|CELEBRATION/,
    );
    const [c] =
      await sql`select c.run, c.final_phase from ceremonies c join rooms r on r.id = c.room_id where r.slug = ${room.slug}`;
    expect(c!.run).toBe(1);
  });

  test("wishes are persisted, moderated by the host and appear for everyone", async () => {
    await focus(guest.page);
    await guest.page.getByTestId("open-wishes").click();
    await focus(guest.page);
    await guest.page.getByTestId("wish-input").fill("Chúc mừng sinh nhật! 🎂 お誕生日おめでとう");
    await focus(guest.page);
    await guest.page.getByTestId("wish-send").click();
    await expect(
      guest.page.getByText("Thanks! Your wish will appear after the host approves it."),
    ).toBeVisible();
    const [w] =
      await sql`select w.status from wishes w join rooms r on r.id = w.room_id where r.slug = ${room.slug}`;
    expect(w!.status).toBe("pending");
    await focus(host.page);
    await host.page.getByTestId("open-wishes").click();
    await focus(host.page);
    await host.page.getByTestId("approve-wish").click();
    await expect(guest.page.getByTestId("wish")).toContainText("Chúc mừng sinh nhật! 🎂 お誕生日おめでとう");
    await expect(host.page.getByTestId("wish")).toHaveCount(1);
    const [after] =
      await sql`select w.status from wishes w join rooms r on r.id = w.room_id where r.slug = ${room.slug}`;
    expect(after!.status).toBe("approved");
  });

  test("gifts are sent, shown to everyone and opened by the host", async () => {
    await focus(guest.page);
    await guest.page.getByTestId("open-gifts").click();
    await focus(guest.page);
    await guest.page.getByTestId("gift-flower_bouquet").click();
    await focus(guest.page);
    await guest.page.getByTestId("gift-send").click();
    await focus(host.page);
    await host.page.getByTestId("open-gifts").click();
    await expect(host.page.getByTestId("gift")).toHaveCount(1);
    await expect(guest.page.getByTestId("open-gift")).toHaveCount(0); // guests can't open
    await focus(host.page);
    await host.page.getByTestId("open-gift").click();
    await expect(guest.page.getByTestId("gift")).toHaveAttribute("data-opened", "true");
  });

  test("taking a party photo produces a share card and notifies other guests", async () => {
    await focus(host.page);
    await host.page.getByTestId("take-photo").click();
    const sheet = host.page.getByTestId("photo-sheet");
    await expect(sheet).toBeVisible();
    const size = await sheet.locator("img").evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      return { w: img.naturalWidth, h: img.naturalHeight };
    });
    expect(size).toEqual({ w: 1200, h: 1500 });
    await expect(guest.page.getByText("Sang took a party photo 📸")).toBeVisible();
    await host.page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("a dropped guest is shown as reconnecting and comes back automatically", async () => {
    await guest.ctx.setOffline(true);
    await expect(guest.page.getByTestId("connection-status")).not.toHaveAttribute(
      "data-status",
      "connected",
      { timeout: 20_000 },
    );
    await guest.ctx.setOffline(false);
    await expect(guest.page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected", {
      timeout: 30_000,
    });
    await expect(host.page.getByTestId("online-count")).toHaveAttribute("data-count", "2", {
      timeout: 15_000,
    });
  });

  test("host can lock the room so new guests cannot join", async ({ browser }) => {
    await focus(host.page);
    await host.page.getByTestId("open-people").click();
    await focus(host.page);
    await host.page.getByTestId("toggle-lock").click();
    const late = await newGuest(browser);
    await late.page.goto(room.inviteUrl);
    await enterParty(late.page, "Late").catch(() => {});
    await expect(late.page.getByTestId("lobby-error")).toContainText("locked");
    await late.ctx.close();
    await focus(host.page);
    await host.page.getByTestId("toggle-lock").click(); // unlock again
  });

  test("the host recovers ownership on a new device with the recovery code", async ({ browser }) => {
    const device = await newGuest(browser);
    await device.page.goto(`/r/${room.slug}`);
    await device.page.getByText("Are you the host on a new device?").click();
    await device.page.getByLabel("Host recovery code").fill(room.recoveryCode.toLowerCase());
    await device.page.getByRole("button", { name: "Recover host access" }).click();
    await expect(device.page.getByText("You're the host")).toBeVisible();
    await device.ctx.close();
  });
});

test.describe("access-code rooms", () => {
  test.skip(({ isMobile }) => isMobile, "runs once");

  test("require the correct access code even with the room code", async ({ browser }) => {
    const host = await newGuest(browser);
    const room = await createRoomViaUI(host.page, { honoree: "Ken", host: "Aya", accessCode: "CAKE24" });
    const guest = await newGuest(browser);
    await guest.page.goto(`/r/${room.slug}`);
    await expect(guest.page.getByTestId("lobby")).toHaveAttribute("data-access", "access_code");
    await focus(guest.page);
    await guest.page.getByLabel("Your display name").fill("Yui");
    await focus(guest.page);
    await guest.page.getByLabel("Access code").fill("WRONG1");
    await focus(guest.page);
    await guest.page.getByTestId("lobby-enter").click();
    await expect(guest.page.getByTestId("lobby-error")).toHaveText("That access code isn't right.");
    await focus(guest.page);
    await guest.page.getByLabel("Access code").fill("cake24");
    await focus(guest.page);
    await guest.page.getByTestId("lobby-enter").click();
    await expect(guest.page.getByTestId("party-room")).toBeVisible({ timeout: 20_000 });
    await host.ctx.close();
    await guest.ctx.close();
  });
});

test.describe("responsive room UI", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile only");

  test("mobile guests get a joystick, bottom actions and no horizontal overflow", async ({
    page,
    browser,
  }) => {
    const hostCtx = await decidedConsent(await browser.newContext());
    await decidedConsent(page.context());
    const hostPage = await hostCtx.newPage();
    const room = await createRoomViaUI(hostPage, { honoree: "Bao", host: "Tam" });
    await page.goto(room.inviteUrl);
    await enterParty(page, "Phone");
    await expect(page.getByTestId("joystick")).toBeVisible();
    await expect(page.getByTestId("open-wishes")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // Joystick drag moves the avatar (authoritative position changes).
    await page.getByTestId("open-people").click();
    const before = await positionOf(page, "Phone");
    await page.getByTestId("panel-people").getByRole("button", { name: "Close" }).click();
    const box = (await page.getByTestId("joystick").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 4, { steps: 4 });
    await page.waitForTimeout(1000);
    await page.mouse.up();
    await page.getByTestId("open-people").click();
    await expect
      .poll(async () => {
        const p = await positionOf(page, "Phone");
        return Math.hypot(p.x - before.x, p.z - before.z);
      })
      .toBeGreaterThan(0.8);
    await hostCtx.close();
  });
});
