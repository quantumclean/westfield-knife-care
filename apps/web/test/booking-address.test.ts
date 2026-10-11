// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { resolveExperimentOrDefault } from "@wkc/shared";
import type { BookingDialogProps } from "../src/forms/BookingForm.tsx";
import type { AppleStreetAddress, AddressSuggestion } from "../src/lib/address-autocomplete.ts";
import { DRAFT_KEY } from "../src/lib/draft.ts";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  autocomplete: vi.fn(),
  search: vi.fn(),
  order: vi.fn(),
}));
vi.mock("../src/lib/apple-maps.ts", () => ({ loadAppleAddressSearch: mocks.load }));
vi.mock("../src/lib/analytics.ts", async (original) => ({
  ...(await original<typeof import("../src/lib/analytics.ts")>()),
  track: vi.fn(),
}));
vi.mock("../src/lib/api.ts", async (original) => ({
  ...(await original<typeof import("../src/lib/api.ts")>()),
  api: { createOrder: mocks.order },
}));

let container: HTMLDivElement;
let props: BookingDialogProps;
let BookingDialog: typeof import("../src/forms/BookingForm.tsx").BookingDialog;
const suggestion = { displayLines: ["123 Elm Street", "Westfield NJ"] } as AddressSuggestion;
const place: AppleStreetAddress = {
  countryCode: "US",
  subThoroughfare: "123",
  thoroughfare: "Elm Street",
  locality: "Westfield",
  subLocality: "",
  administrativeAreaCode: "NJ",
  postCode: "07090",
};
const selected = { line1: "123 Elm Street", city: "Westfield", state: "NJ", zip: "07090" };

async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function mount() {
  await act(async () => {
    render(h(BookingDialog, props), container);
  });
}
function field(name: string) {
  return container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
}
async function input(name: string, value: string, type = "input") {
  await act(async () => {
    field(name).value = value;
    field(name).dispatchEvent(new Event(type, { bubbles: true }));
  });
}
async function click(text: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(text),
  );
  expect(button, text).toBeTruthy();
  await act(async () => {
    button!.click();
  });
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
async function openSearch() {
  await click("Find address with Apple Maps");
  return container.querySelector<HTMLInputElement>("[role=combobox]")!;
}
async function pick(query: HTMLInputElement) {
  await act(async () => {
    query.value = "123 Elm";
    query.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await tick(350);
  await act(async () => {
    query.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  await act(async () => {
    query.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
  });
}
async function search() {
  await pick(await openSearch());
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubEnv("VITE_APPLE_MAPS_TOKEN", "test-placeholder-not-a-token");
  vi.resetModules();
  ({ BookingDialog } = await import("../src/forms/BookingForm.tsx"));
  sessionStorage.clear();
  mocks.load
    .mockReset()
    .mockResolvedValue({ autocomplete: mocks.autocomplete, search: mocks.search });
  mocks.autocomplete.mockReset().mockResolvedValue({ results: [suggestion] });
  mocks.search.mockReset().mockResolvedValue({ places: [place] });
  // Deliberate failure prevents navigation while recording the real parsed order payload.
  mocks.order.mockReset().mockRejectedValue(new Error("Synthetic checkout"));
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  container = document.createElement("div");
  document.body.append(container);
  const experiment = resolveExperimentOrDefault("experiment-001");
  props = {
    open: true,
    onClose: vi.fn(),
    experiment,
    session: {
      visitor_id: "00000000-0000-4000-8000-000000000001",
      experiment,
      attribution: { source: "direct", acquisition_channel: "direct" },
    },
    config: { status: "ready", config: { payments_enabled: true, care_days: ["2026-10-13"] } },
    onRetryConfig: vi.fn(),
    resumed: false,
    onWaitlist: vi.fn(),
  };
  await mount();
  await submit();
  await input("name", "Ada Example");
  await input("email", "ada@example.com");
  await input("phone", "9085550123");
  await input("line2", "Apartment 4B");
});
afterEach(async () => {
  await act(async () => {
    render(null, container);
  });
  container.remove();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Apple selection in the controlled booking sheet", () => {
  it("updates displayed fields, immediate checkout payload and draft, retaining unit and notes", async () => {
    await input("notes", "Side door");
    await search();
    for (const [key, value] of Object.entries(selected)) expect(field(key).value).toBe(value);
    await submit();
    expect(mocks.order).toHaveBeenCalledOnce();
    expect(mocks.order.mock.calls[0]![0].customer.address).toEqual({
      ...selected,
      line2: "Apartment 4B",
    });
    expect(mocks.order.mock.calls[0]![0].notes).toBe("Side door");
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).contact).toMatchObject({
      ...selected,
      line2: "Apartment 4B",
      notes: "Side door",
    });
  });
  it("saves a selection without checkout and restores it on remount", async () => {
    await search();
    await tick(250);
    await act(async () => {
      render(null, container);
    });
    props.resumed = true;
    await mount();
    expect(field("line1").value).toBe(selected.line1);
    expect(field("line2").value).toBe("Apartment 4B");
  });
  it("offers prefilled waitlist for an out-of-area selection and never submits it", async () => {
    mocks.search.mockResolvedValue({
      places: [{ ...place, postCode: "10001", locality: "New York", administrativeAreaCode: "NY" }],
    });
    await search();
    await submit();
    expect(mocks.order).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Pay $39 and book");
    await click("Join the waitlist");
    expect(props.onWaitlist).toHaveBeenCalledWith(
      "out-of-area",
      expect.objectContaining({ notes: "Outside the area: ZIP 10001", email: "ada@example.com" }),
    );
    await tick(250);
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).contact.zip).toBe("10001");
  });
  it("clears address errors after a valid in-area selection, retaining unrelated errors", async () => {
    await input("email", "invalid");
    await submit();
    expect(container.textContent).toContain("Enter the street address for pickup.");
    await search();
    expect(container.textContent).not.toContain("Enter the street address for pickup.");
    expect(container.textContent).not.toContain("Enter a 5-digit ZIP code.");
    expect(container.textContent).toContain("Enter a valid email address.");
  });
  it("leaves focus in the search box when a selection clears only some errors", async () => {
    await input("email", "invalid");
    await submit(); // flags the email and every empty address field
    const query = await openSearch();
    await act(async () => {
      query.focus();
    });
    await pick(query);
    // The remaining email error must not drag the cursor out of the search box.
    expect(document.activeElement).toBe(query);
  });
  it("replaces an out-of-area error with checkout after an in-area ZIP+4 selection", async () => {
    await input("zip", "10001");
    await act(async () => {
      field("zip").dispatchEvent(new FocusEvent("blur"));
    });
    mocks.search.mockResolvedValue({ places: [{ ...place, postCode: "07090-1234" }] });
    await search();
    await submit();
    expect(mocks.order).toHaveBeenCalledOnce();
    expect(mocks.order.mock.calls[0]![0].customer.address.zip).toBe("07090-1234");
    expect(container.textContent).not.toContain("Join the waitlist");
  });
  it.each([
    ["line1", "456 Manual Road", "input"],
    ["state", "NY", "change"],
    ["line2", "Unit 9", "input"],
  ])("ignores late details after editing %s", async (key, value, event) => {
    let finish!: (value: { places: AppleStreetAddress[] }) => void;
    mocks.search.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await search();
    await input(key, value, event);
    await act(async () => {
      finish({ places: [place] });
    });
    expect(field(key).value).toBe(value);
    expect(field("zip").value).toBe("");
  });
  it("ignores late details after close/reopen", async () => {
    let finish!: (value: { places: AppleStreetAddress[] }) => void;
    mocks.search.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await search();
    props.open = false;
    await mount();
    props.open = true;
    await mount();
    await act(async () => {
      finish({ places: [place] });
    });
    expect(field("line1").value).toBe("");
    expect(container.textContent).toContain("Find address with Apple Maps");
  });
  it("keeps manual checkout and native autofill available after SDK failure", async () => {
    mocks.load.mockRejectedValue(new Error("SDK unavailable"));
    await click("Find address with Apple Maps");
    await tick();
    expect(container.textContent).toContain("Address suggestions are unavailable");
    for (const [key, value] of Object.entries(selected))
      await input(key, value, key === "state" ? "change" : "input");
    expect(field("line1").autocomplete).toBe("address-line1");
    expect(field("line2").autocomplete).toBe("address-line2");
    await submit();
    expect(mocks.order).toHaveBeenCalledOnce();
  });
});

describe("analytics in the booking sheet: steps and suggestion outcomes, never typed values", () => {
  const TYPED = [
    "Ada Example",
    "ada@example.com",
    "9085550123",
    "Apartment 4B",
    "123 Elm",
    "Elm Street",
    "07090",
    "10001",
    "Side door",
    "9 Oak Lane",
  ];
  async function tracked() {
    const { track } = await import("../src/lib/analytics.ts");
    return vi
      .mocked(track)
      .mock.calls.map(([name, props]) => [name, props ?? {}] as [string, Record<string, unknown>]);
  }
  async function expectNothingTyped() {
    const text = JSON.stringify(await tracked());
    for (const value of TYPED) expect(text).not.toContain(value);
  }

  it("records reaching step 2 and a shown, chosen suggestion", async () => {
    await input("notes", "Side door");
    await search();
    await submit();
    const calls = await tracked();
    expect(calls).toContainEqual(["booking_step", { step: "details" }]);
    expect(calls).toContainEqual(["address_suggest", { action: "shown", results: "1-3" }]);
    expect(calls).toContainEqual(["address_suggest", { action: "chosen" }]);
    expect(calls.filter(([, p]) => p.action === "fallback" || p.action === "out_of_area")).toEqual(
      [],
    );
    await expectNothingTyped();
  });

  it("records an out-of-area suggestion", async () => {
    mocks.search.mockResolvedValue({
      places: [{ ...place, postCode: "10001", locality: "New York", administrativeAreaCode: "NY" }],
    });
    await search();
    expect(await tracked()).toContainEqual(["address_suggest", { action: "out_of_area" }]);
    await expectNothingTyped();
  });

  it("records a fallback when the address is typed after opening the search", async () => {
    await openSearch();
    await tick();
    await input("line1", "9 Oak Lane");
    expect(await tracked()).toContainEqual(["address_suggest", { action: "fallback" }]);
    await expectNothingTyped();
  });

  it("records unavailable suggestions when the SDK fails", async () => {
    mocks.load.mockRejectedValue(new Error("SDK unavailable"));
    await click("Find address with Apple Maps");
    await tick();
    expect(await tracked()).toContainEqual(["address_suggest", { action: "unavailable" }]);
  });

  it("records form errors as field ids and kinds", async () => {
    await input("email", "invalid");
    await submit();
    const [, props] = (await tracked()).find(([name]) => name === "form_error")!;
    expect(props).toMatchObject({ form: "booking" });
    expect(String(props.fields).split(",")).toEqual(
      expect.arrayContaining(["email", "line1", "zip"]), // town defaults to Westfield
    );
    expect(String(props.kinds).split(",").sort()).toEqual(["format", "missing"]);
    expect(JSON.stringify(props)).not.toContain("invalid");
  });
});
