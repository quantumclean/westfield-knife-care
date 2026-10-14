import { describe, expect, it } from "vitest";
import {
  CATALOG,
  EVENT_NAMES,
  FUNNEL_STEPS,
  analyticsSource,
  deviceClass,
  formFieldId,
  normalizeEvent,
  onceKey,
  parseEventPayload,
  routeId,
  validateEventProps,
  viewportBand,
} from "../src/index.ts";

const PERSONAL = [
  "ada@example.com",
  "Ada Lovelace",
  "(908) 555-0123",
  "9085550123",
  "12 Elm St, Westfield NJ 07090",
  "https://sharp.usabiology.com/thanks?order=123&session_id=cs_test_1",
  "cs_test_a1b2c3",
];

const envelope = {
  v: 2,
  event_id: "0b6f8f5e-1c1f-4a52-9b1e-6a4f3f1d2c3b",
  view_id: "5d0e7f1a-2b3c-4d5e-8f90-a1b2c3d4e5f6",
  experiment_id: "experiment-002",
  source: "flyer-b",
  acquisition_channel: "print",
  visitor_id: "00000000-0000-4000-8000-000012345678",
  route: "/b",
  device: "desktop",
  viewport: "lg",
};

describe("event catalog", () => {
  it("keeps the v1 funnel step names", () => {
    expect(FUNNEL_STEPS).toEqual([
      "page_view",
      "cta_click",
      "booking_opened",
      "booking_submitted",
      "checkout_started",
      "checkout_completed",
    ]);
  });

  it("describes every event and allows no free-text property", () => {
    for (const name of EVENT_NAMES) {
      const spec = CATALOG[name];
      expect(spec).toBeDefined();
      for (const rule of Object.values(spec.props))
        expect(["enum", "int", "list"]).toContain(rule.kind);
    }
  });

  it("allows no order, payment, contact or visitor identifiers as props", () => {
    const banned = /order|session|email|phone|name$|address|street|zip|token|visitor|ip|url|query/;
    for (const name of EVENT_NAMES) {
      for (const key of Object.keys(CATALOG[name].props)) expect(key).not.toMatch(banned);
    }
  });
});

describe("validateEventProps (server allowlist)", () => {
  it("rejects personal data in every string-valued prop of every event", () => {
    for (const name of EVENT_NAMES) {
      for (const key of Object.keys(CATALOG[name].props)) {
        for (const value of PERSONAL) {
          expect(validateEventProps(name, { [key]: value }).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("rejects unknown props, including the v1 order_id", () => {
    expect(validateEventProps("checkout_started", { total_cents: 3900, order_id: "id-1" })).toEqual(
      ["checkout_started: a property is not allowed"],
    );
  });

  it("never echoes a rejected value", () => {
    const problems = validateEventProps("cta_click", { cta: "ada@example.com", location: "hero" });
    expect(problems.join(" ")).not.toContain("ada@example.com");
  });

  it("requires the props that give an event meaning", () => {
    expect(validateEventProps("section_view", {})).toEqual(['section_view: "section" is required']);
    expect(validateEventProps("section_view", { section: "pricing" })).toEqual([]);
  });

  it("only accepts canonical id lists for form errors", () => {
    expect(validateEventProps("form_error", { form: "booking", fields: "email,zip" })).toEqual([]);
    expect(validateEventProps("form_error", { form: "booking", fields: "zip,email" })).not.toEqual(
      [],
    );
    expect(
      validateEventProps("form_error", { form: "booking", fields: "customer.address.zip" }),
    ).not.toEqual([]);
  });

  it("bounds integers", () => {
    expect(validateEventProps("booking_submitted", { knives: 4, total_cents: 3900 })).toEqual([]);
    expect(validateEventProps("booking_submitted", { knives: 9085550123 })).not.toEqual([]);
    expect(validateEventProps("booking_submitted", { knives: 2.5 })).not.toEqual([]);
  });
});

describe("the three-ways interactions", () => {
  it("counts the choice cards and interest forms with fixed vocabularies only", () => {
    for (const location of ["ways", "ways-mail-in", "ways-gift"]) {
      expect(validateEventProps("cta_click", { cta: "pilot", location })).toEqual([]);
      expect(validateEventProps("pilot_opened", { location })).toEqual([]);
    }
    for (const section of ["ways", "prepare"]) {
      expect(validateEventProps("section_view", { section })).toEqual([]);
    }
    for (const interest of ["mail_in", "gift"]) {
      expect(validateEventProps("pilot_submitted", { cadence: "once", interest })).toEqual([]);
    }
  });

  it("cannot carry a recipient, an address or any free text", () => {
    for (const [name, props] of [
      ["pilot_opened", { location: "ways-gift", recipient: "Ada Lovelace" }],
      ["pilot_opened", { location: "12 Elm St, Westfield NJ 07090" }],
      ["pilot_submitted", { cadence: "once", interest: "gift", recipient_email: "a@b.co" }],
      ["pilot_submitted", { cadence: "once", interest: "gift for Ada" }],
      ["cta_click", { cta: "pilot", location: "ways-gift", address: "1 Main St" }],
    ] as const) {
      expect(validateEventProps(name, props), name).not.toEqual([]);
    }
    // The browser-side normaliser drops them instead of sending them.
    expect(normalizeEvent("pilot_opened", { location: "ways-gift", recipient: "Ada" })).toEqual({
      name: "pilot_opened",
      props: { location: "ways-gift" },
    });
    expect(normalizeEvent("pilot_opened", { location: "1 Main St, Westfield" })?.props).toEqual({
      location: "other",
    });
  });
});

describe("normalizeEvent (browser)", () => {
  it("drops v1 identifiers and dates the catalog no longer carries", () => {
    expect(normalizeEvent("checkout_started", { order_id: "id-1", total_cents: 3900 })).toEqual({
      name: "checkout_started",
      props: { total_cents: 3900 },
    });
    expect(
      normalizeEvent("booking_submitted", { knives: 4, care_day: "2026-10-13", total_cents: 3900 }),
    ).toEqual({ name: "booking_submitted", props: { knives: 4, total_cents: 3900 } });
  });

  it("maps validation paths onto field ids, never values", () => {
    const event = normalizeEvent("form_error", {
      form: "booking",
      fields: "customer.address.zip,customer.email,customer.email,number_of_knives,ada@example.com",
    });
    expect(event).toEqual({
      name: "form_error",
      props: { form: "booking", fields: "email,knives,other,zip" },
    });
    expect(validateEventProps("form_error", event!.props)).toEqual([]);
  });

  it("turns an unknown location into other, and drops other unknown values", () => {
    expect(normalizeEvent("cta_click", { cta: "sharpen", location: "ada@example.com" })).toEqual({
      name: "cta_click",
      props: { cta: "sharpen", location: "other" },
    });
    expect(normalizeEvent("faq_opened", { question: "what is your address?" })).toBeNull();
  });

  it("returns null for unknown events", () => {
    expect(normalizeEvent("typed_value", { value: "secret" })).toBeNull();
  });

  it("produces only values the server accepts", () => {
    const samples: [string, Record<string, unknown>][] = [
      ["section_view", { section: "faq" }],
      ["scroll_depth", { percent: 75 }],
      ["video_unmute", { format: "square", at_seconds: 12 }],
      ["address_suggest", { action: "chosen", results: "1-3" }],
      ["client_error", { kind: "api", area: "booking", status: "5xx" }],
      ["web_vitals", { lcp: "good", cls: "poor", nav: "reload" }],
    ];
    for (const [name, props] of samples) {
      const event = normalizeEvent(name, props)!;
      expect(validateEventProps(event.name, event.props)).toEqual([]);
    }
  });
});

describe("dedup keys", () => {
  it("keys once-per-view events by their distinguishing prop", () => {
    expect(onceKey("scroll_depth", { percent: 50 })).toBe("scroll_depth:50");
    expect(onceKey("page_view", {})).toBe("page_view");
    expect(onceKey("cta_click", { cta: "sharpen", location: "hero" })).toBeUndefined();
  });
});

describe("context buckets", () => {
  it("reports routes, never raw paths", () => {
    expect(routeId("/")).toBe("/");
    expect(routeId("/A/")).toBe("/a");
    expect(routeId("/b")).toBe("/b");
    expect(routeId("/thanks.html")).toBe("/thanks");
    expect(routeId("/ada@example.com")).toBe("other");
  });

  it("classifies mobile, tablet and desktop", () => {
    expect(deviceClass(390, true)).toBe("mobile");
    expect(deviceClass(820, true)).toBe("tablet");
    expect(deviceClass(820, false)).toBe("desktop");
    expect(deviceClass(1280, false)).toBe("desktop");
    expect(viewportBand(320)).toBe("xs");
    expect(viewportBand(390)).toBe("xs");
    expect(viewportBand(414)).toBe("sm");
    expect(viewportBand(800)).toBe("md");
    expect(viewportBand(1280)).toBe("lg");
  });

  it("keeps campaign tags but not identifying ones", () => {
    expect(analyticsSource("flyer-a")).toBe("flyer-a");
    expect(analyticsSource(undefined)).toBe("direct");
    expect(analyticsSource("9085550123")).toBe("other");
    expect(analyticsSource("ada@example.com")).toBe("other");
    expect(formFieldId("customer.phone")).toBe("phone");
  });
});

describe("parseEventPayload", () => {
  it("rejects mixed experiment contexts in one page batch", () => {
    const parsed = parseEventPayload({
      events: [
        { ...envelope, name: "page_view" },
        {
          ...envelope,
          experiment_id: "experiment-001",
          route: "/a",
          name: "scroll_depth",
          props: { percent: 25 },
        },
      ],
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects the whole batch if any event carries personal data", () => {
    const parsed = parseEventPayload({
      events: [
        { ...envelope, name: "page_view" },
        { ...envelope, name: "form_error", props: { form: "booking", fields: "ada@example.com" } },
      ],
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects oversized batches", () => {
    const events = Array.from({ length: 21 }, () => ({ ...envelope, name: "page_view" }));
    expect(parseEventPayload({ events }).ok).toBe(false);
  });

  it("normalises a v1 event from a tab opened before the deploy", () => {
    const parsed = parseEventPayload({
      experiment_id: "experiment-001",
      visitor_id: "00000000-0000-4000-8000-000012345678",
      name: "checkout_started",
      page: "/thanks",
      props: { order_id: "id-1", total_cents: 3900 },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.events[0]).toMatchObject({
      name: "checkout_started",
      route: "/thanks",
      device: "unknown",
      props: { total_cents: 3900 },
    });
    expect(JSON.stringify(parsed.events)).not.toContain("id-1");
  });

  it("rejects v1 events the catalog does not know", () => {
    expect(
      parseEventPayload({
        experiment_id: "experiment-001",
        visitor_id: "00000000-0000-4000-8000-000012345678",
        name: "anything_goes",
      }).ok,
    ).toBe(false);
  });
});

describe("deletion proof of possession", () => {
  it("hashes a key to the 64-hex owner that events carry, and the forget body needs the key", async () => {
    const {
      ownerHashOf,
      forgetVisitorSchema,
      OWNER_HASH_PATTERN,
      parseEventPayload: parse,
    } = await import("../src/index.ts");
    const key = "v".repeat(43);
    const owner = await ownerHashOf(key);
    expect(owner).toMatch(OWNER_HASH_PATTERN);
    expect(await ownerHashOf(key)).toBe(owner);
    expect(await ownerHashOf("w".repeat(43))).not.toBe(owner);
    expect(parse({ events: [{ ...envelope, name: "page_view", owner }] }).ok).toBe(true);
    expect(parse({ events: [{ ...envelope, name: "page_view", owner: key }] }).ok).toBe(false);
    expect(
      forgetVisitorSchema.safeParse({ visitor_id: "00000000-0000-4000-8000-000012345678" }).success,
    ).toBe(false);
    expect(
      forgetVisitorSchema.safeParse({ visitor_id: "00000000-0000-4000-8000-000012345678", key })
        .success,
    ).toBe(true);
  });
});
