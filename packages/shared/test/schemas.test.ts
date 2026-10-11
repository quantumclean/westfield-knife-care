import { describe, expect, it } from "vitest";
import {
  createEventSchema,
  createOrderSchema,
  createWaitlistSchema,
  formatIssues,
  updateOrderSchema,
} from "../src/index.ts";

const validOrder = {
  experiment_id: "experiment-001",
  source: "flyer-v1-qr",
  acquisition_channel: "print",
  visitor_id: "visitor-12345678",
  customer: {
    name: "Ada Lovelace",
    email: "ADA@Example.com ",
    phone: "(555) 010-2030",
    address: { line1: "1 Main St", city: "Westfield", state: "nj", zip: "07090" },
  },
  number_of_knives: 4,
  care_day: "2026-09-26",
  notes: "",
};

describe("createOrderSchema", () => {
  it("accepts and normalises a valid order", () => {
    const parsed = createOrderSchema.parse(validOrder);
    expect(parsed.customer.email).toBe("ada@example.com");
    expect(parsed.customer.address.state).toBe("NJ");
    expect(parsed.notes).toBeUndefined();
  });

  it("defaults attribution when missing", () => {
    const { source, acquisition_channel, ...rest } = validOrder;
    const parsed = createOrderSchema.parse(rest);
    expect(parsed.source).toBe("direct");
    expect(parsed.acquisition_channel).toBe("direct");
  });

  it("reports readable issues", () => {
    const result = createOrderSchema.safeParse({ ...validOrder, number_of_knives: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatIssues(result.error)[0]).toMatch(/^number_of_knives: /);
    }
  });
});

describe("createWaitlistSchema", () => {
  it("requires a cadence and interest", () => {
    const result = createWaitlistSchema.safeParse({
      experiment_id: "experiment-002",
      name: "Grace",
      email: "grace@example.com",
    });
    expect(result.success).toBe(false);
  });
});

describe("createEventSchema", () => {
  const v2 = {
    v: 2,
    event_id: "0b6f8f5e-1c1f-4a52-9b1e-6a4f3f1d2c3b",
    view_id: "5d0e7f1a-2b3c-4d5e-8f90-a1b2c3d4e5f6",
    experiment_id: "experiment-001",
    visitor_id: "visitor-12345678",
    route: "/a",
    device: "mobile",
    viewport: "sm",
  };

  it("accepts a catalog event and rejects malformed names", () => {
    expect(
      createEventSchema.safeParse({
        ...v2,
        name: "cta_click",
        props: { cta: "sharpen", location: "hero" },
      }).success,
    ).toBe(true);
    expect(createEventSchema.safeParse({ ...v2, name: "CTA CLICK" }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...v2, name: "made_up_event" }).success).toBe(false);
  });

  it("rejects unknown envelope keys such as a raw URL", () => {
    expect(
      createEventSchema.safeParse({
        ...v2,
        name: "page_view",
        page_location: "https://sharp.usabiology.com/thanks?order=x",
      }).success,
    ).toBe(false);
  });
});

describe("updateOrderSchema", () => {
  it("requires at least one field", () => {
    expect(updateOrderSchema.safeParse({}).success).toBe(false);
    expect(updateOrderSchema.safeParse({ pickup_status: "picked_up" }).success).toBe(true);
  });
});
