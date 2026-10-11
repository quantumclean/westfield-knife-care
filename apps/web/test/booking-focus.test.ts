// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { resolveExperimentOrDefault } from "@wkc/shared";
import type { BookingDialogProps } from "../src/forms/BookingForm.tsx";

const mocks = vi.hoisted(() => ({ order: vi.fn() }));
vi.mock("../src/lib/analytics.ts", () => ({ EVENTS: {}, track: vi.fn() }));
vi.mock("../src/lib/api.ts", async (original) => ({
  ...(await original<typeof import("../src/lib/api.ts")>()),
  api: { createOrder: mocks.order },
}));

let container: HTMLDivElement;
let props: BookingDialogProps;
let BookingDialog: typeof import("../src/forms/BookingForm.tsx").BookingDialog;

const field = (name: string) => container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;

async function mount() {
  await act(async () => {
    render(h(BookingDialog, props), container);
  });
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
/** Type like a person: focus the field first, then change its value. */
async function type(name: string, value: string) {
  await act(async () => {
    field(name).focus();
    field(name).value = value;
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function focus(name: string) {
  await act(async () => {
    field(name).focus();
  });
}

beforeEach(async () => {
  vi.stubEnv("VITE_APPLE_MAPS_TOKEN", "");
  vi.resetModules();
  ({ BookingDialog } = await import("../src/forms/BookingForm.tsx"));
  sessionStorage.clear();
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
      visitor_id: "visitor-focus-test",
      experiment,
      attribution: { source: "direct", acquisition_channel: "direct" },
    },
    config: { status: "ready", config: { payments_enabled: true, care_days: ["2026-10-13"] } },
    onRetryConfig: vi.fn(),
    resumed: false,
    onWaitlist: vi.fn(),
  };
  await mount();
  await submit(); // step 1 -> step 2
});
afterEach(async () => {
  await act(async () => {
    render(null, container);
  });
  container.remove();
  vi.unstubAllEnvs();
});

describe("focus stays where the customer is typing", () => {
  it("moves to the first invalid field after a failed submit, and only then", async () => {
    await submit();
    expect(document.activeElement).toBe(field("name"));
  });

  it("does not jump away while a flagged field is being fixed", async () => {
    await submit(); // every required field is now flagged; focus lands on Name
    await type("name", "A");
    expect(document.activeElement).toBe(field("name"));
    await type("name", "Ada");
    expect(document.activeElement).toBe(field("name"));
  });

  it("lets Tab leave a field whose blur check just failed", async () => {
    await type("email", "not-an-email");
    await focus("phone"); // what Tab or a tap elsewhere does: the email field blurs
    expect(document.activeElement).toBe(field("phone"));
  });

  it("does not pull focus back to an earlier flagged field on a valid blur", async () => {
    await submit();
    await type("email", "ada@example.com");
    await focus("phone");
    expect(document.activeElement).toBe(field("phone"));
  });
});
