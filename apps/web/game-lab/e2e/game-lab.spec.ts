import { expect, test, type Page } from "@playwright/test";

/**
 * Playable-slice checks in Chromium. The iPhone-sized project emulates a
 * phone's viewport and touch input; it is not iOS Safari, which still needs
 * a manual check on a real device.
 */

interface Target {
  kind: string;
  x: number;
  y: number;
  r: number;
}
interface DebugState {
  phase: string;
  edge: number;
  band: string;
  score: number;
  cuts: number;
  items: number;
  targets: Target[];
  /** Street mode only. */
  proposals?: number;
  yeses?: number;
  walked?: number;
  customers?: { id: number; x: number; y: number; reply: string | null; won: boolean }[];
}

type Mode = "street" | "classic";

const state = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __gameLab: { state(): DebugState } }).__gameLab.state(),
  );

async function startGame(page: Page, mode: Mode, query = "") {
  await page.goto(`./?test&seed=5&mode=${mode}${query}`);
  await expect(page.getByRole("heading", { name: "The Edge Returns" })).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  // First visit: the tutorial cards (three on the counter, four in the street).
  const next = page.getByRole("button", { name: "Next" });
  for (let i = 0; i < (mode === "street" ? 3 : 2); i++) await next.click();
  await page.getByRole("button", { name: "Let's cut" }).click();
  await expect.poll(async () => (await state(page)).phase).toBe("level1");
}

/** A tap at (x, y): a real touch on touch devices, a click otherwise. */
async function tapAt(page: Page, x: number, y: number) {
  const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  if (!touch) return page.mouse.click(x, y);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** A fast swipe through (x, y): real touch events on touch devices, mouse moves otherwise. */
async function swipeThrough(page: Page, t: Target) {
  const x0 = t.x - 8;
  const y0 = t.y - t.r * 2.6;
  const x1 = t.x + 8;
  const y1 = t.y + t.r * 2.6;
  const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: x0, y: y0 }],
    });
    for (let i = 1; i <= 6; i++) {
      const k = i / 6;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(x0, y0);
    await page.mouse.move(x1, y1, { steps: 6 });
  }
}

/** Keeps swiping at ingredients until the score moves (they are moving targets). */
async function sliceUntilScored(page: Page) {
  for (let i = 0; i < 80; i++) {
    const s = await state(page);
    if (s.score > 0) return s;
    const t = s.targets.find((t) => t.kind !== "lid" && t.kind !== "glint");
    if (t) await swipeThrough(page, t);
    else await page.waitForTimeout(100);
  }
  return state(page);
}

test.describe("Classic (the counter)", () => {
  test("loads offline-clean: no errors, no other origins, no horizontal overflow", async ({
    page,
  }) => {
    const errors: string[] = [];
    const foreign: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon/i.test(m.location().url)) errors.push(m.text());
    });
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (!["127.0.0.1", "localhost"].includes(u.hostname) && u.protocol !== "data:")
        foreign.push(r.url());
    });
    await page.goto("./?test&mode=classic");
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
    await expect(page).toHaveTitle("The Edge Returns");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(foreign).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("tutorial, then a swipe through an ingredient scores in Level 1", async ({ page }) => {
    await startGame(page, "classic");
    await expect(page.getByText("Swipe through the tomato")).toBeVisible();
    const s = await sliceUntilScored(page);
    expect(s.score).toBeGreaterThan(0);
    expect(s.cuts).toBeGreaterThan(0);
    await expect(page.locator(".gl-score-value")).not.toHaveText("0");
  });

  test("plays Level 1 → pickup, sharpening and return → Level 2 → results", async ({ page }) => {
    await startGame(page, "classic", "&speed=8&l1=10&l2=10");
    // No input at all: the edge still runs out and the story moves on.
    await expect.poll(async () => (await state(page)).phase, { timeout: 20000 }).toBe("sharpen");
    await expect(page.getByRole("heading", { name: "Sharpening" })).toBeVisible();
    const sharpen = page.getByRole("button", { name: "Sharpen", exact: true });
    for (let i = 0; i < 8; i++) await sharpen.click();
    await expect(page.getByText("The Edge Returns", { exact: true }).last()).toBeVisible();
    await expect(page.locator(".gl-meter")).toHaveAttribute("aria-valuenow", "100");
    await page.getByRole("button", { name: "Start Level 2" }).click({ timeout: 15000 });
    await expect.poll(async () => (await state(page)).phase).toBe("level2");
    await expect(page.locator(".gl-level")).toHaveText("Level 2 · The Edge Returns");
    await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "Play again" }).click();
    await expect.poll(async () => (await state(page)).phase).toBe("level1");
  });

  test("Skip goes straight from the service beats to Level 2", async ({ page }) => {
    await startGame(page, "classic", "&speed=8&l1=10");
    await expect
      .poll(async () => (await state(page)).phase, { timeout: 20000 })
      .toMatch(/pickup|sharpen/);
    await page.getByRole("button", { name: "Skip" }).click();
    await expect.poll(async () => (await state(page)).phase).toBe("level2");
  });

  test("restart, pause and mute (mute survives a reload)", async ({ page }) => {
    await startGame(page, "classic");
    await page.getByRole("button", { name: "Mute" }).click();
    await expect(page.getByRole("button", { name: "Unmute" })).toBeVisible();
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.getByRole("dialog", { name: "Paused" })).toBeHidden();
    await page.getByRole("button", { name: "Restart" }).click();
    await expect.poll(async () => (await state(page)).phase).toBe("level1");
    expect((await state(page)).score).toBe(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
    await expect(page.locator(".gl-setting", { hasText: "Sound" }).getByRole("button")).toHaveText(
      "Off",
    );
  });

  test("reduced motion: ingredients hold still and can still be cut", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startGame(page, "classic");
    await expect(page.locator(".gl-stage")).toHaveAttribute("data-reduced", "");
    await expect
      .poll(async () => (await state(page)).targets.length, { timeout: 8000 })
      .toBeGreaterThan(0);
    const a = (await state(page)).targets[0]!;
    await page.waitForTimeout(300);
    const b = (await state(page)).targets.find((t) => Math.abs(t.x - a.x) < 1);
    expect(b && Math.abs(b.y - a.y)).toBeLessThan(1);
    const s = await sliceUntilScored(page);
    expect(s.score).toBeGreaterThan(0);
  });

  test("keyboard: Escape pauses, arrow keys cut by lane", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard play is checked on desktop");
    await startGame(page, "classic");
    await expect
      .poll(async () => (await state(page)).targets.length, { timeout: 8000 })
      .toBeGreaterThan(0);
    for (let i = 0; i < 30 && (await state(page)).score === 0; i++) {
      for (const key of ["ArrowLeft", "ArrowDown", "ArrowRight"]) await page.keyboard.press(key);
      await page.waitForTimeout(100);
    }
    expect((await state(page)).score).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  });
});

test.describe("Street (Westfield walk)", () => {
  test("is the default, loads clean and makes no requests to other sites", async ({ page }) => {
    const errors: string[] = [];
    const foreign: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon/i.test(m.location().url)) errors.push(m.text());
    });
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (!["127.0.0.1", "localhost"].includes(u.hostname) && u.protocol !== "data:")
        foreign.push(r.url());
    });
    await page.goto("./?test");
    await expect(page.getByRole("button", { name: "Street" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      await page.evaluate(
        () => (window as unknown as { __gameLab: { mode: string } }).__gameLab.mode,
      ),
    ).toBe("street");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(foreign).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("walks forward, and a swipe through thrown fruit scores", async ({ page }) => {
    await startGame(page, "street");
    await expect(page.locator(".gl-level")).toHaveText("Walk 1 · Dull Days");
    const w0 = (await state(page)).walked!;
    const s = await sliceUntilScored(page);
    expect(s.score).toBeGreaterThan(0);
    expect(s.walked!).toBeGreaterThan(w0);
  });

  test("tapping a neighbor proposes, and they answer", async ({ page }) => {
    await startGame(page, "street");
    await expect
      .poll(async () => (await state(page)).customers!.length, { timeout: 20000 })
      .toBeGreaterThan(0);
    const c = (await state(page)).customers![0]!;
    await tapAt(page, c.x, c.y);
    await expect.poll(async () => (await state(page)).proposals).toBe(1);
    await expect(page.locator(".gl-asked")).toHaveText(/Asked 1 · Yes [01]/);
    await expect
      .poll(async () => (await state(page)).customers!.find((k) => k.id === c.id)?.reply ?? "gone")
      .toMatch(/no|yes|gone/);
  });

  test("plays Walk 1 → pickup, sharpening and return → Walk 2 → results", async ({ page }) => {
    await startGame(page, "street", "&speed=8&l1=10&l2=10");
    await expect.poll(async () => (await state(page)).phase, { timeout: 25000 }).toBe("sharpen");
    const sharpen = page.getByRole("button", { name: "Sharpen", exact: true });
    for (let i = 0; i < 8; i++) await sharpen.click();
    await page.getByRole("button", { name: "Start Level 2" }).click({ timeout: 15000 });
    await expect(page.locator(".gl-level")).toHaveText("Walk 2 · The Edge Returns");
    await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({ timeout: 25000 });
    await expect(page.locator(".gl-results dt", { hasText: "Proposals" })).toBeVisible();
  });

  test("Hardcore: nothing cuts in Walk 1", async ({ page }) => {
    await startGame(page, "street", "&hardcore");
    let swipes = 0;
    for (let i = 0; i < 60 && swipes < 4; i++) {
      const s = await state(page);
      const t = s.targets.find((t) => t.kind !== "lid" && t.kind !== "glint");
      if (t) {
        await swipeThrough(page, t);
        swipes++;
      } else await page.waitForTimeout(150);
    }
    expect(swipes).toBeGreaterThan(0);
    const s = await state(page);
    expect(s.band).toBe("gone");
    expect(s.cuts).toBe(0);
  });

  test("knife style and mode choices stick", async ({ page }) => {
    await page.goto("./?test");
    await page.getByLabel("Knife").selectOption("japanese");
    await expect(page.getByText(/Japanese gyuto: cuts with lighter swipes/)).toBeVisible();
    await page.getByRole("button", { name: "Classic" }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __gameLab: { mode: string } }).__gameLab.mode),
      )
      .toBe("classic");
    await page.reload();
    await expect(page.getByLabel("Knife")).toHaveValue("japanese");
    await expect(page.getByRole("button", { name: "Classic" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("reduced motion: the view holds still instead of walking", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await startGame(page, "street");
    await expect(page.locator(".gl-stage")).toHaveAttribute("data-reduced", "");
    const a = (await state(page)).walked!;
    await page.waitForTimeout(1200);
    expect((await state(page)).walked).toBe(a);
    const s = await sliceUntilScored(page);
    expect(s.score).toBeGreaterThan(0);
  });
});
