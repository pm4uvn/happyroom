/**
 * HAPPYROOM World end-to-end: real Next.js + real Colyseus zone server + real PostgreSQL,
 * two independent browser contexts (separate sessions = separate users). No mocks, no bots.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";
test.describe.configure({ mode: "serial" });

const uniq = () => Math.random().toString(36).slice(2, 8);

async function newUser(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  await ctx.addInitScript(() => window.localStorage.setItem("hr_analytics_consent", "denied"));
  return { ctx, page: await ctx.newPage() };
}

async function createCharacter(
  page: Page,
  name: string,
  avatar = "mint",
  age: "adult" | "teen" | "under13" = "adult",
) {
  await expect(page).toHaveURL(/\/world\/character/);
  await page.getByLabel("Display name").fill(name);
  await page.getByTestId(`character-avatar-${avatar}`).click();
  await page.getByTestId(`age-${age}`).check({ force: true });
  await page.getByTestId("character-save").click();
}

async function inWorld(page: Page, zone = "central_plaza") {
  await expect(page.getByTestId("world")).toHaveAttribute("data-zone", zone, { timeout: 30_000 });
  await expect(page.getByTestId("world")).toHaveAttribute("data-phase", "ready", { timeout: 30_000 });
  await expect(page.getByTestId("world-status")).toHaveAttribute("data-status", "connected");
}

async function selfPos(page: Page) {
  const el = page.locator('[data-testid="presence-player"][data-self="true"]');
  return { x: Number(await el.getAttribute("data-x")), z: Number(await el.getAttribute("data-z")) };
}
async function posOf(page: Page, name: string) {
  const el = page.locator(`[data-testid="presence-player"][data-name="${name}"]`);
  return { x: Number(await el.getAttribute("data-x")), z: Number(await el.getAttribute("data-z")) };
}
async function hold(page: Page, key: string, ms: number) {
  await page.bringToFront();
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

test.describe("HAPPYROOM World", () => {
  test.skip(({ isMobile }) => isMobile, "multi-user flow runs on desktop");

  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  let a: { ctx: BrowserContext; page: Page };
  let b: { ctx: BrowserContext; page: Page };
  const nameA = `Mai${uniq()}`;
  const nameB = `Linh${uniq()}`;
  const username = `mai_${uniq()}`;

  test.beforeAll(async ({ browser }) => {
    a = await newUser(browser);
    b = await newUser(browser);
  });
  test.afterAll(async () => {
    await a.ctx.close();
    await b.ctx.close();
    await sql.end();
  });

  test("world requires sign-in; unsigned visitors are sent to /login", async () => {
    await a.page.goto("/world");
    await expect(a.page).toHaveURL(/\/login/);
    const providers = await (await a.page.request.get("/api/auth/providers")).json();
    expect(providers).toMatchObject({ guest: true, password: true }); // Google only when configured
  });

  test("user A creates a password account and a unique character; user B plays as guest", async () => {
    await a.page.getByTestId("login-toggle").click();
    await a.page.getByLabel("Username").fill(username);
    await a.page.getByLabel("Password").fill("correct-horse-battery");
    await a.page.getByTestId("login-submit").click();
    await createCharacter(a.page, nameA, "mint");
    await inWorld(a.page);

    await b.page.goto("/login");
    await b.page.getByTestId("login-guest").click();
    // Unique names: B cannot take A's name (case-insensitive).
    await expect(b.page).toHaveURL(/\/world\/character/);
    await b.page.getByLabel("Display name").fill(nameA.toUpperCase());
    await b.page.getByTestId("character-save").click();
    await expect(b.page.getByTestId("character-error")).toContainText("taken");
    await createCharacter(b.page, nameB, "berry", "teen");
    await inWorld(b.page);

    const [row] =
      await sql`select auth_kind, avatar_preset, age_band, profile_complete, password_hash like 'scrypt$%' as hashed
                              from player_profiles where display_name = ${nameA}`;
    expect(row).toMatchObject({
      auth_kind: "password",
      avatar_preset: "mint",
      age_band: "adult",
      profile_complete: true,
      hashed: true,
    });
  });

  test("both spawn in the same Central Plaza instance and see each other (real presence only)", async () => {
    await expect(a.page.getByTestId("world-online")).toHaveAttribute("data-count", "2", { timeout: 15_000 });
    await expect(b.page.getByTestId("world-online")).toHaveAttribute("data-count", "2");
    await expect(a.page.locator(`[data-testid="presence-player"][data-name="${nameB}"]`)).toHaveCount(1, {
      timeout: 10_000,
    });
    await expect(a.page.getByTestId("zone-name")).toHaveText("Central Plaza");
    await expect(a.page.getByTestId("minimap")).toBeVisible();
  });

  test("movement (walk + sprint) is visible to the other user", async () => {
    const before = await posOf(b.page, nameA);
    await a.page.mouse.click(550, 300);
    await hold(a.page, "KeyD", 900);
    await expect
      .poll(
        async () =>
          Math.hypot((await posOf(b.page, nameA)).x - before.x, (await posOf(b.page, nameA)).z - before.z),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(1.5);
    // Sprint covers more ground in the same time.
    const s0 = await selfPos(a.page);
    await a.page.bringToFront();
    await a.page.keyboard.down("ShiftLeft");
    await hold(a.page, "KeyA", 900);
    await a.page.keyboard.up("ShiftLeft");
    await a.page.waitForTimeout(600);
    const s1 = await selfPos(a.page);
    expect(Math.hypot(s1.x - s0.x, s1.z - s0.z)).toBeGreaterThan(3.5);
  });

  test("chat is delivered to the other player and can be reported", async () => {
    await a.page.bringToFront();
    await a.page.getByTestId("open-chat").click();
    await a.page.getByTestId("chat-input").fill("Hello from the plaza!");
    await a.page.getByTestId("chat-send").click();
    await b.page.bringToFront();
    await b.page.getByTestId("open-chat").click();
    await expect(b.page.getByTestId("chat-message").last()).toContainText("Hello from the plaza!");
    await b.page.getByTestId("chat-report").last().click();
    await b.page.getByTestId("report-send").click();
    await expect(b.page.getByText("Thanks — our team will review it.")).toBeVisible();
    const [r] =
      await sql`select reason, evidence->>'chatText' as text from player_reports order by created_at desc limit 1`;
    expect(r).toMatchObject({ reason: "harassment", text: "Hello from the plaza!" });
  });

  test("a dropped player reconnects automatically", async () => {
    await b.ctx.setOffline(true);
    await expect(b.page.getByTestId("world-status")).not.toHaveAttribute("data-status", "connected", {
      timeout: 20_000,
    });
    await b.ctx.setOffline(false);
    await expect(b.page.getByTestId("world-status")).toHaveAttribute("data-status", "connected", {
      timeout: 30_000,
    });
    await expect(a.page.getByTestId("world-online")).toHaveAttribute("data-count", "2", { timeout: 15_000 });
  });

  test("Birthday House: Enter prompt → menu → private party → back to the plaza at the door", async () => {
    await a.page.goto("/world?zone=central_plaza&spawn=spawn_birthday_house");
    await inWorld(a.page);
    const prompt = a.page.getByTestId("interact");
    await expect(prompt).toHaveAttribute("data-focus", "birthday_house_door");
    await a.page.keyboard.press("KeyE");
    await expect(a.page.getByTestId("house-menu")).toBeVisible();
    await a.page.getByTestId("house-back").click(); // "Return to Plaza" closes the menu
    await expect(a.page.getByTestId("house-menu")).toBeHidden();
    await a.page.getByTestId("interact").click();
    await a.page.getByTestId("house-create").click();

    // Existing private-party flow (not a public zone).
    await expect(a.page).toHaveURL(/\/create$/);
    await expect(a.page.getByTestId("back-to-plaza")).toBeVisible();
    const wizard = a.page.getByTestId("create-wizard");
    await wizard.getByTestId("create-next").click();
    await a.page.getByLabel("Who is the birthday person?").fill("Bé Na");
    await a.page.getByLabel("Your name (host)").fill(nameA);
    for (let i = 0; i < 5; i++) await wizard.getByTestId("create-next").click();
    await a.page.getByTestId("create-submit").click();
    await a.page.getByTestId("recovery-ack").check();
    await a.page.getByTestId("enter-room").click();
    await expect(a.page.getByLabel("Your display name")).toHaveValue(nameA); // prefilled from world profile
    await a.page.getByTestId("lobby-enter").click();
    await expect(a.page.getByTestId("party-room")).toBeVisible({ timeout: 20_000 });
    // Private party never shows up as a public world zone.
    const zones = await (await a.page.request.get("/api/world/zones")).json();
    expect(zones.zones.map((z: { zoneId: string }) => z.zoneId)).not.toContain(
      expect.stringMatching(/party|room/),
    );

    await a.page.getByTestId("party-leave").click();
    await inWorld(a.page);
    const back = await selfPos(a.page);
    expect(Math.hypot(back.x - 0, back.z - -9.4)).toBeLessThan(1.5); // in front of the Birthday House
  });

  test("portal to the second zone (loaded from registry data) and back", async () => {
    await a.page.goto("/world?zone=central_plaza&spawn=spawn_east_gate");
    await inWorld(a.page);
    // Arriving at a gate, the camera starts on the open side looking back at the gate: W walks towards it.
    await hold(a.page, "KeyW", 700);
    await expect(a.page.getByTestId("interact")).toHaveAttribute("data-focus", "garden_gate", {
      timeout: 5000,
    });
    await a.page.keyboard.press("KeyE");
    await inWorld(a.page, "garden_terrace");
    await expect(a.page.getByTestId("zone-name")).toHaveText("Garden Terrace");
    await hold(a.page, "KeyW", 700);
    await expect(a.page.getByTestId("interact")).toHaveAttribute("data-focus", "plaza_gate", {
      timeout: 5000,
    });
    await a.page.keyboard.press("KeyE");
    await inWorld(a.page, "central_plaza");
    const p = await selfPos(a.page);
    expect(Math.hypot(p.x - 16.2, p.z)).toBeLessThan(1.5); // arrives at the plaza's east gate
  });

  test("profile and location persist across a reload (session cookie)", async () => {
    const before = await selfPos(a.page);
    await a.page.goto("/world");
    await inWorld(a.page);
    const after = await selfPos(a.page);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(1.5);
    await a.page.getByTestId("open-settings").click();
    await a.page.getByTestId("setting-showStats").check();
    await expect(a.page.getByTestId("perf-stats")).toBeVisible({ timeout: 5000 });
  });

  test("under-13 players have no public chat", async ({ browser }) => {
    const kid = await newUser(browser);
    await kid.page.goto("/login");
    await kid.page.getByTestId("login-guest").click();
    await createCharacter(kid.page, `Kid${uniq()}`, "sky", "under13");
    await inWorld(kid.page);
    await kid.page.getByTestId("open-chat").click();
    await expect(kid.page.getByText("Public chat is off for players under 13.")).toBeVisible();
    await expect(kid.page.getByTestId("chat-input")).toHaveCount(0);
    await kid.ctx.close();
  });
});

test.describe("World on mobile", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile only");
  test("joystick moves the avatar in real 3D coordinates", async ({ page }) => {
    await page.context().addInitScript(() => window.localStorage.setItem("hr_analytics_consent", "denied"));
    await page.goto("/login");
    await page.getByTestId("login-guest").click();
    await createCharacter(page, `Phone${uniq()}`, "plum");
    await inWorld(page);
    const before = await selfPos(page);
    const box = (await page.getByTestId("world-joystick").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 });
    await page.waitForTimeout(900);
    await page.mouse.up();
    await expect
      .poll(async () => Math.hypot((await selfPos(page)).x - before.x, (await selfPos(page)).z - before.z))
      .toBeGreaterThan(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
