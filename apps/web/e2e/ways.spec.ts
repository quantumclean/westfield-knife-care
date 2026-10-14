import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow, mockApi } from "./helpers.ts";

/** Send queued analytics now, as the browser does when the page is hidden. */
const flushEvents = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("pagehide")));

test.describe("three ways: pickup, mail-in, gift", () => {
  test("pickup is bookable; mail-in and gifts are clearly coming soon and interest only", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/a");
    const ways = page.locator("#ways");
    await expect(ways.getByRole("heading", { name: "Three ways to a fresh edge" })).toBeVisible();

    const pickup = ways.locator("article.way-open");
    await expect(pickup).toContainText("Local pickup and return");
    await expect(pickup).toContainText("$39 for 4 knives");
    await expect(pickup.getByRole("button", { name: /Sharpen My Knives/ })).toBeVisible();

    for (const [name, interest] of [
      ["Mail-in sharpening", "mail-in sharpening"],
      ["Give it as a gift", "gifting"],
    ] as const) {
      const card = ways.locator("article.way", { hasText: name });
      await expect(card).toContainText("Coming soon");
      await expect(card).toContainText("interest only");
      // Nothing to buy: no price, and the only action is to register interest.
      await expect(card).not.toContainText("$");
      await expect(card.getByRole("button")).toHaveCount(1);
      await expect(
        card.getByRole("button", { name: `Tell us you are interested in ${interest}` }),
      ).toBeVisible();
    }
  });

  test("a gift is presented as a way to pay, apart from the two ways to hand over knives", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/a");
    const grid = page.locator("#ways .ways-grid");
    await expect(grid.locator("article.way")).toHaveCount(2);
    await expect(grid).not.toContainText("gift");
    const gift = page.locator("#ways article.way-gift");
    await expect(gift).toContainText("not a third way to handle knives");
    // The gift band sits below the grid of ways to hand over knives.
    const gridBox = (await grid.boundingBox())!;
    const giftBox = (await gift.boundingBox())!;
    expect(giftBox.y).toBeGreaterThanOrEqual(gridBox.y + gridBox.height - 1);
  });

  // One test per arm: each gets a fresh page, so a booking draft saved in the tab by the other
  // arm (which is intended behavior) cannot change the preselected knife count.
  for (const [arm, price, knives] of [
    ["a", "$39", "4 knives"],
    ["b", "$49", "5 knives"],
  ] as const) {
    test(`/${arm} keeps the headline, ${price} for ${knives}, and opens the same booking sheet`, async ({
      page,
    }) => {
      await mockApi(page);
      await page.goto(`/${arm}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "Good food starts with a sharp knife.",
      );
      await expect(page.locator(".hero-copy")).toContainText(`${price}`);
      await expect(page.locator("#ways article.way-open")).toContainText(`${price} for ${knives}`);
      await page.locator("#ways article.way-open").getByRole("button").click();
      const sheet = page.getByRole("dialog", { name: "Knives & pickup day" });
      await expect(sheet.locator(".receipt-amount")).toHaveText(price);
      await expect(sheet.locator(".receipt-line")).toContainText(knives);
    });
  }

  test("the Gift nav link leads to the interest-only gift band, without a purchase path", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/a");
    const link = page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Gift" });
    await expect(link).toBeVisible();
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(24);
    await link.click();
    await expect(page).toHaveURL(/#gift$/);
    const gift = page.locator("#gift");
    await expect(gift).toBeInViewport();
    // Not hidden under the sticky header.
    const headerBottom =
      (await page.locator(".site-header").boundingBox())!.y +
      (await page.locator(".site-header").boundingBox())!.height;
    expect((await gift.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom - 1);
    await expect(gift).toContainText("Coming soon");
    await expect(gift).not.toContainText("$");
  });

  test("the hero and the new section never overflow the screen", async ({ page }) => {
    await mockApi(page);
    for (const path of ["/", "/a", "/b"]) {
      await page.goto(path);
      await page.locator("#prepare").scrollIntoViewIfNeeded();
      expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(0);
    }
  });

  test("at 320px wide and 640px tall the booking button is on the first screen", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "small-mobile-light", "320px layout only");
    await page.setViewportSize({ width: 320, height: 640 });
    await mockApi(page);
    await page.goto("/a");
    const box = (await page.locator(".hero-cta").boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(640);
    expect(box.width).toBeGreaterThan(250);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("interest-only forms", () => {
  for (const [topic, button, title, interest, hint] of [
    [
      "mail_in",
      "Tell us you are interested in mail-in sharpening",
      "Interested in mail-in?",
      "mail_in",
      "the town you are in",
    ],
    [
      "gift",
      "Tell us you are interested in gifting",
      "Interested in gifts?",
      "gift",
      "recipient's name or address",
    ],
  ] as const) {
    test(`${topic}: saves interest only, with no payment, address or recipient`, async ({
      page,
    }) => {
      const recorded = await mockApi(page);
      await page.goto("/b");
      await page.locator("#ways").getByRole("button", { name: button }).click();

      const dialog = page.getByRole("dialog", { name: title });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Interest only");
      await expect(dialog).toContainText("you will not be charged");
      await expect(dialog.getByLabel("Anything we should know?")).toBeVisible();
      await expect(dialog).toContainText(hint);
      // No rhythm or interest pickers, no address, no payment.
      await expect(dialog.locator("select")).toHaveCount(0);
      await expect(dialog.getByLabel(/street|zip|address/i)).toHaveCount(0);

      await dialog.getByLabel("Your name").fill("Ada Example");
      await dialog.getByLabel("Email").fill("ada@example.com");
      await dialog.getByRole("button", { name: "Tell us you are interested" }).click();

      await expect(dialog).toContainText("You are on the list");
      await expect(dialog).toContainText("Nothing has been charged");

      expect(recorded.waitlist).toHaveLength(1);
      const body = JSON.parse(recorded.waitlist[0]!);
      expect(body).toMatchObject({
        experiment_id: "experiment-002",
        service_interest: interest,
        cadence: "once",
        name: "Ada Example",
        email: "ada@example.com",
      });
      expect(Object.keys(body).join(",")).not.toMatch(/address|line1|zip|recipient|care_day/);
      expect(recorded.urls.join("\n")).not.toContain("/orders");

      // Analytics saw that the card was used, and nothing the visitor typed.
      await flushEvents(page);
      await expect
        .poll(() => recorded.events.join("\n"))
        .toContain(`ways-${topic.replace("_", "-")}`);
      const analytics = recorded.events.join("\n");
      expect(analytics).not.toContain("Ada");
      expect(analytics).not.toContain("ada@example.com");
      expect(analytics).not.toMatch(/recipient|address|line1/i);
    });
  }

  test("the Always Sharp waitlist is unchanged: its own interests and rhythms only", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/a");
    await page.getByRole("button", { name: "or join the Always Sharp waitlist" }).click();
    const dialog = page.getByRole("dialog", { name: "Join the Always Sharp Pilot" });
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText("Interest only");
    const interests = await dialog.locator("#pilot-interest option").allTextContents();
    expect(interests).toEqual(["One-off sharpening", "Always Sharp swap program", "Both"]);
    const cadences = await dialog.locator("#pilot-cadence option").allTextContents();
    expect(cadences).toEqual(["Weekly", "Every two weeks", "Monthly"]);
  });

  test("works from the keyboard: Enter opens the form, Escape closes it", async ({ page }) => {
    await mockApi(page);
    await page.goto("/a");
    const button = page
      .locator("#ways")
      .getByRole("button", { name: "Tell us you are interested in mail-in sharpening" });
    await button.scrollIntoViewIfNeeded();
    await button.focus();
    await expect(button).toBeFocused();
    // A visible focus indicator, not just a focused element.
    const outline = await button.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth));
    expect(outline).toBeGreaterThan(0);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Interested in mail-in?" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("the booking button stays visible after the interest form closes", async ({ page }) => {
    await mockApi(page);
    await page.goto("/a");
    await page
      .locator("#ways")
      .getByRole("button", { name: /interested in gifting/ })
      .click();
    await page
      .getByRole("dialog", { name: "Interested in gifts?" })
      .getByRole("button", { name: "Close" })
      .click();
    const pickup = page.locator("#ways article.way-open").getByRole("button");
    await pickup.scrollIntoViewIfNeeded();
    await expect(pickup).toBeVisible();
    const box = (await pickup.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("getting ready", () => {
  test("shows four preparation steps, and mail-in only as a preview with no kit", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/a");
    const prep = page.locator("#prepare");
    await prep.scrollIntoViewIfNeeded();
    await expect(prep.locator(".prep-step")).toHaveCount(4);
    await expect(prep).toContainText("Cover each blade");
    const preview = prep.locator(".prep-note-soon");
    await expect(preview).toContainText("not available yet");
    await expect(preview).toContainText("do not send knives to us");
  });
});
