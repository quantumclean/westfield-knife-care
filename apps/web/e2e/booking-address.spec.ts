import { expect, test, type Page } from "@playwright/test";

const disabled = Boolean(process.env.WKC_MAPS_DISABLED);
const address = {
  line1: "123 Elm Street",
  line2: "Apartment 4B",
  city: "Westfield",
  state: "NJ",
  zip: "07090",
};

async function setup(page: Page, mode = "normal") {
  const orders: Record<string, any>[] = [];
  let appleRequests = 0;
  // Block every external request; the only Apple response is this synthetic SDK.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "cdn.apple-mapkit.com") {
      appleRequests++;
      if (mode === "failure") return route.abort();
      return route.fulfill({
        contentType: "application/javascript",
        body: `
        window.mapkit = {
          load: async () => window.mapkit,
          Search: class {
            async autocomplete(query) {
              return { results: [{ displayLines: ["123 Elm Street", "Westfield NJ"], query }] };
            }
            async search(suggestion) {
              window.__detailsStarted = true;
              if (${JSON.stringify(mode)} === "slow") await new Promise(resolve => { window.__finishDetails = resolve; });
              return { places: [{ countryCode: "US", subThoroughfare: "123", thoroughfare: "Elm Street",
                locality: "Westfield", subLocality: "", administrativeAreaCode: "NJ",
                postCode: suggestion.query.includes("outside") ? "10001" : "07090" }] };
            }
          }
        };`,
      });
    }
    if (url.origin !== "http://127.0.0.1:5207") return route.abort();
    if (url.pathname === "/api/config")
      return route.fulfill({
        json: { payments_enabled: true, care_days: ["2026-10-13", "2026-10-15"] },
      });
    if (url.pathname === "/api/events") return route.fulfill({ status: 204 });
    if (url.pathname === "/api/orders") {
      orders.push(route.request().postDataJSON());
      // Exercise the API call without creating an order or navigating to Stripe.
      return route.fulfill({ status: 503, json: { error: "synthetic_checkout" } });
    }
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({ status: 404, json: { error: "synthetic_not_found" } });
    return route.continue();
  });
  return { orders, appleRequests: () => appleRequests };
}

async function open(page: Page, arm: string, price: number, knives: number) {
  await page.goto(`/${arm}`);
  await page.locator(".hero-cta").click();
  const dialog = page.getByRole("dialog", { name: "Knives & pickup day" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".receipt-amount")).toHaveText(`$${price}`);
  await expect(dialog.locator(".receipt-line")).toContainText(`${knives} knives`);
  await expect(dialog.getByRole("button", { name: "Find address with Apple Maps" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Ada Example");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Mobile number").fill("9085550123");
  await page.getByText("Apartment or notes", { exact: true }).click();
  await page.getByLabel("Apartment, suite, etc.").fill(address.line2);
}

async function choose(page: Page, query = "123 Elm", touch = false) {
  const button = page.getByRole("button", { name: "Find address with Apple Maps" });
  if (await button.count()) await button.click();
  const search = page.getByRole("combobox", { name: "Find your pickup address" });
  await search.fill(query);
  await expect(page.getByRole("option", { name: /123 Elm Street/ })).toBeVisible();
  if (touch) await page.getByRole("option", { name: /123 Elm Street/ }).tap();
  else {
    await search.press("ArrowDown");
    await expect(search).toHaveAttribute("aria-activedescendant", "address-result-0");
    await search.press("Enter");
  }
}

async function manual(page: Page) {
  await page.getByLabel("Street address").fill("456 Manual Road");
  await page.getByLabel("Town").fill("Cranford");
  await page.getByLabel("State").selectOption("NJ");
  await page.getByLabel("ZIP").fill("07016");
}

for (const [arm, price, knives] of [
  ["a", 39, 4],
  ["b", 49, 5],
] as const) {
  test(`${arm}: manual checkout${disabled ? " with Maps disabled" : " without requesting Maps"}`, async ({
    page,
  }) => {
    const calls = await setup(page);
    await open(page, arm, price, knives);
    await manual(page);
    await expect(page.getByLabel("Street address")).toHaveAttribute(
      "autocomplete",
      "address-line1",
    );
    await expect(page.getByLabel("Apartment, suite, etc.")).toHaveAttribute(
      "autocomplete",
      "address-line2",
    );
    if (disabled)
      await expect(page.getByRole("button", { name: "Find address with Apple Maps" })).toHaveCount(
        0,
      );
    await page.getByRole("button", { name: `Pay $${price} and book` }).click();
    await expect.poll(() => calls.orders.length).toBe(1);
    expect(calls.orders[0]!.customer.address).toEqual({
      ...address,
      line1: "456 Manual Road",
      city: "Cranford",
      zip: "07016",
    });
    expect(calls.appleRequests()).toBe(0);
  });

  test(`${arm}: selection, unit, draft, payload, keyboard/touch and sheet layout`, async ({
    page,
    isMobile,
  }, testInfo) => {
    test.skip(disabled);
    const calls = await setup(page);
    await open(page, arm, price, knives);
    await choose(page, "123 Elm", isMobile);
    await expect(page.getByLabel("Street address")).toHaveValue(address.line1);
    await expect(page.getByLabel("Apartment, suite, etc.")).toHaveValue(address.line2);
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(sessionStorage.getItem("wkc.booking.draft") ?? "null")?.contact.line1,
        ),
      )
      .toBe(address.line1);
    const layout = await page.evaluate(() => {
      const footer = document.querySelector("dialog[open] .modal-footer")!.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        footerBottom: footer.bottom,
        height: innerHeight,
      };
    });
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.footerBottom).toBeLessThanOrEqual(layout.height + 1);
    await page.screenshot({ path: testInfo.outputPath(`${arm}-selection.png`) });
    await page.getByRole("button", { name: `Pay $${price} and book` }).click();
    await expect.poll(() => calls.orders.length).toBe(1);
    expect(calls.orders[0]!.customer.address).toEqual(address);
    expect(calls.orders[0]!.number_of_knives).toBe(knives);
    await page.reload();
    await page.locator(".hero-cta").click();
    // The sheet is lazy loaded again after reload; wait for Step 1 before continuing.
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByLabel("Street address")).toHaveValue(address.line1);
    await expect(page.getByLabel("Apartment, suite, etc.")).toHaveValue(address.line2);
  });

  test(`${arm}: out-of-area suggestion offers prefilled waitlist`, async ({ page }) => {
    test.skip(disabled);
    const calls = await setup(page);
    await open(page, arm, price, knives);
    await choose(page, "outside");
    await expect(page.getByRole("button", { name: `Pay $${price} and book` })).toHaveCount(0);
    await page
      .getByRole("dialog", { name: "Pickup address" })
      .getByRole("button", { name: "Join the waitlist", exact: true })
      .click();
    const waitlist = page.locator("dialog[open]");
    await expect(waitlist.getByLabel("Email")).toHaveValue("ada@example.com");
    await expect(waitlist.locator("textarea")).toHaveValue(/10001/);
    expect(calls.orders).toHaveLength(0);
  });

  test(`${arm}: SDK failure keeps manual checkout`, async ({ page }) => {
    test.skip(disabled);
    const calls = await setup(page, "failure");
    await open(page, arm, price, knives);
    await page.getByRole("button", { name: "Find address with Apple Maps" }).click();
    await expect(
      page.getByText("Address suggestions are unavailable. Enter your address below."),
    ).toBeVisible();
    await manual(page);
    await page.getByRole("button", { name: `Pay $${price} and book` }).click();
    await expect.poll(() => calls.orders.length).toBe(1);
  });

  test(`${arm}: pending details cannot overwrite manual edits`, async ({ page }) => {
    test.skip(disabled);
    await setup(page, "slow");
    await open(page, arm, price, knives);
    await choose(page);
    await expect.poll(() => page.evaluate(() => (window as any).__detailsStarted)).toBe(true);
    await manual(page);
    await page.evaluate(() => (window as any).__finishDetails());
    await expect(page.getByLabel("Street address")).toHaveValue("456 Manual Road");
    await expect(page.getByLabel("ZIP")).toHaveValue("07016");
  });

  test(`${arm}: Escape dismisses results; close/reopen discards late details`, async ({ page }) => {
    test.skip(disabled);
    await setup(page, "slow");
    await open(page, arm, price, knives);
    await page.getByRole("button", { name: "Find address with Apple Maps" }).click();
    const search = page.getByRole("combobox", { name: "Find your pickup address" });
    await search.fill("123 Elm");
    await expect(page.getByRole("option", { name: /123 Elm Street/ })).toBeVisible();
    await search.press("Escape");
    await expect(search).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("dialog", { name: "Pickup address" })).toBeVisible();
    await choose(page, "123 Elm Street");
    await expect.poll(() => page.evaluate(() => (window as any).__detailsStarted)).toBe(true);
    await search.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.locator(".hero-cta").click();
    await expect(page.getByRole("button", { name: "Find address with Apple Maps" })).toBeVisible();
    await page.evaluate(() => (window as any).__finishDetails());
    await expect(page.getByLabel("Street address")).toHaveValue("");
    await expect(page.getByLabel("Apartment, suite, etc.")).toHaveValue(address.line2);
  });
}
