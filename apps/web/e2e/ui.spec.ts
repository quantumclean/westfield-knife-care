import { expect, test } from "@playwright/test";
import { FEEDBACK_TOKEN, horizontalOverflow, mockApi, paidOrder } from "./helpers.ts";

test.describe("landing page", () => {
  test("the kitchen photo loads in the pricing section", async ({ page }) => {
    await mockApi(page);
    await page.goto("/a");
    const img = page.locator("#pricing .kitchen-photo img");
    await img.scrollIntoViewIfNeeded();
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
    const sheet = page.getByRole("dialog", { name: "Knives & pickup day" });
    await expect(sheet).toBeVisible();
    const close = sheet.getByRole("button", { name: "Close" });
    await expect(close).toBeVisible();
    await expect(close).toBeFocused();
    // Exercise keyboard focus explicitly, including on touch-sized projects.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();
    await expect(close).toHaveCSS("outline-style", "solid");
    await expect(close).toHaveCSS("outline-width", "2px");
    await expect(close).toHaveCSS("outline-offset", "2px");
  });

  test("keeps a visible keyboard focus indicator on form fields", async ({ page }) => {
    await mockApi(page);
    await page.goto("/a#book");
    const sheet = page.getByRole("dialog", { name: "Knives & pickup day" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Tab");
    const selected = sheet.locator(".chip input:checked");
    await expect(selected).toBeFocused();
    const ring = selected.locator("..").locator("span").first();
    await expect(ring).toBeVisible();
    const outline = await ring.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth));
    expect(outline).toBeGreaterThan(0);
  });

  test("Continue opens step 2, focuses the name, and keeps Pay visible", async ({ page }) => {
    await mockApi(page);
    await page.goto("/a#book");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Pickup address" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("Your name")).toBeFocused();
    const pay = sheet.getByRole("button", { name: "Pay $39 and book" });
    await expect(pay).toBeVisible();
    const bounds = (await pay.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
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
    await expect(page.getByRole("heading", { name: "Confirming your payment…" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thank you, Ada!" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("the paid booking pass downloads a pickup calendar event", async ({ page }) => {
    await mockApi(page);
    await page.goto("/thanks?order=id-0001");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Add pickup to calendar" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("knife-pickup-2026-10-13.ics");
    const stream = await file.createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const calendar = Buffer.concat(chunks).toString("utf8");
    expect(calendar).toContain("BEGIN:VCALENDAR");
    expect(calendar).toContain("20261013");
    expect(calendar).toContain("BEGIN:VALARM");
    expect(calendar).not.toContain(FEEDBACK_TOKEN);
    expect(calendar).not.toContain("Ada");
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
