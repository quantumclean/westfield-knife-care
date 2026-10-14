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
}

const state = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __gameLab: { state(): DebugState } }).__gameLab.state(),
  );

async function startGame(page: Page, query = "") {
  await page.goto(`./?test&seed=5${query}`);
  await expect(page.getByRole("heading", { name: "The Edge Returns" })).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  // First visit: three tutorial cards.
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Let's cut" }).click();
  await expect.poll(async () => (await state(page)).phase).toBe("level1");
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

test.describe("The Edge Returns game-lab", () => {
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
    await page.goto("./?test");
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
    await expect(page).toHaveTitle("The Edge Returns");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(foreign).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("tutorial, then a swipe through an ingredient scores in Level 1", async ({ page }) => {
    await startGame(page);
    await expect(page.getByText("Swipe through the tomato")).toBeVisible();
    const s = await sliceUntilScored(page);
    expect(s.score).toBeGreaterThan(0);
    expect(s.cuts).toBeGreaterThan(0);
    await expect(page.locator(".gl-score-value")).not.toHaveText("0");
  });

  test("plays Level 1 → pickup, sharpening and return → Level 2 → results", async ({ page }) => {
    await startGame(page, "&speed=8&l1=10&l2=10");
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
    await startGame(page, "&speed=8&l1=10");
    await expect
      .poll(async () => (await state(page)).phase, { timeout: 20000 })
      .toMatch(/pickup|sharpen/);
    await page.getByRole("button", { name: "Skip" }).click();
    await expect.poll(async () => (await state(page)).phase).toBe("level2");
  });

  test("restart, pause and mute (mute survives a reload)", async ({ page }) => {
    await startGame(page);
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
    await startGame(page);
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
    await startGame(page);
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
