import { expect, test } from "@playwright/test";
import { FEEDBACK_TOKEN, horizontalOverflow, mockApi, paidOrder } from "./helpers.ts";

test.describe("landing page", () => {
  test("hero photo loads and has a real size", async ({ page }) => {
    await mockApi(page);
    await page.goto("/a");
    const img = page.locator(".hero-media img");
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
    const box = (await img.boundingBox())!;
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThan(150);
  });

  test("has no horizontal overflow", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("frozen flyer prices: /a is $39 for 4 knives, /b is $49 for 5", async ({ page }) => {
    await mockApi(page);
    await page.goto("/a");
    await expect(page.locator(".hero-copy")).toContainText("$39");
    await expect(page.locator(".hero-copy")).toContainText("4 knives");
    await page.goto("/b");
    await expect(page.locator(".hero-copy")).toContainText("$49");
    await expect(page.locator(".hero-copy")).toContainText("5 knives");
  });
});

test.describe("booking modal", () => {
  test("opens with the close button focused, and the focus ring is not heavy", async ({ page }) => {
    await mockApi(page);
    await page.goto("/a#book");
    const close = page.getByRole("button", { name: "Close" });
    await expect(close).toBeVisible();
    await expect(close).toBeFocused();
    // A 3px ring with a 5px offset around a 44px button looked heavy and boxy on open.
    const outlineWidth = await close.evaluate((el) =>
      parseFloat(getComputedStyle(el).outlineWidth),
    );
    expect(outlineWidth).toBeLessThanOrEqual(2);
  });

  test("keeps a visible keyboard focus indicator on form fields", async ({ page }) => {
    await mockApi(page);
    await page.goto("/a#book");
    await page.keyboard.press("Tab");
    const style = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return { outline: parseFloat(s.outlineWidth), shadow: s.boxShadow };
    });
    expect(style.outline > 0 || style.shadow !== "none").toBe(true);
  });
});

test.describe("thank-you page", () => {
  test("a failed order lookup shows a readable error that fits the screen", async ({ page }) => {
    await mockApi(page, { orderStatus: 500 });
    await page.goto("/thanks?order=id-0001");
    const notice = page.locator(".notice-error");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("could not load your order");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const box = (await notice.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await expect(page.locator("body")).not.toContainText(/500|internal_error/);
  });

  test("a missing order id is a friendly not-found", async ({ page }) => {
    await mockApi(page);
    await page.goto("/thanks");
    await expect(page.locator(".notice-error")).toContainText("could not find that order");
  });

  test("paid order: removes ft from the address bar, keeps order and session_id", async ({
    page,
  }) => {
    const recorded = await mockApi(page);
    await page.goto(`/thanks?order=id-0001&ft=${FEEDBACK_TOKEN}&session_id=cs_test_1`);
    await expect(page.getByRole("heading", { name: "Thank you, Ada!" })).toBeVisible();
    await expect(page).toHaveURL(/\/thanks\?order=id-0001&session_id=cs_test_1$/);
    expect(page.url()).not.toContain(FEEDBACK_TOKEN);
    // Nothing the page sent anywhere carries the token.
    expect(recorded.urls.join("\n")).not.toContain(FEEDBACK_TOKEN);
    expect(recorded.events.join("\n")).not.toContain(FEEDBACK_TOKEN);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("pending order polls and flips to paid when the webhook lands", async ({ page }) => {
    await mockApi(page, { orders: [{ ...paidOrder, payment_status: "pending" }, paidOrder] });
    await page.goto("/thanks?order=id-0001&session_id=cs_test_1");
    await expect(page.getByText("Confirming your payment")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thank you, Ada!" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("feedback prompt sends the token in the body, once, and never in a URL", async ({
    page,
  }) => {
    const recorded = await mockApi(page);
    await page.goto(`/thanks?order=id-0001&feedback=1&ft=${FEEDBACK_TOKEN}`);
    await expect(page.getByText("Would you use Westfield Knife Care again?")).toBeVisible();
    expect(page.url()).not.toContain(FEEDBACK_TOKEN);
    await page.getByRole("button", { name: "Yes" }).click();
    await expect(page.getByText("Thanks, that helps us decide")).toBeVisible();
    expect(recorded.feedback).toHaveLength(1);
    expect(JSON.parse(recorded.feedback[0]!)).toEqual({
      repeat_intent: "yes",
      token: FEEDBACK_TOKEN,
    });
    expect(recorded.urls.join("\n")).not.toContain(FEEDBACK_TOKEN);
  });

  test("no feedback prompt without a token, even with feedback=1", async ({ page }) => {
    await mockApi(page);
    await page.goto("/thanks?order=id-0001&feedback=1");
    await expect(page.getByRole("heading", { name: "Thank you, Ada!" })).toBeVisible();
    await expect(page.getByText("Would you use Westfield Knife Care again?")).toHaveCount(0);
  });
});
