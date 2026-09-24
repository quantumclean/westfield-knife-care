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
  it("bounds event names and props", () => {
    const ok = createEventSchema.safeParse({
      experiment_id: "experiment-001",
      visitor_id: "visitor-12345678",
      name: "cta_click",
      props: { cta: "sharpen", location: "hero" },
    });
    expect(ok.success).toBe(true);
    const bad = createEventSchema.safeParse({
      experiment_id: "experiment-001",
      visitor_id: "visitor-12345678",
      name: "CTA CLICK",
    });
    expect(bad.success).toBe(false);
  });
});

describe("updateOrderSchema", () => {
  it("requires at least one field", () => {
    expect(updateOrderSchema.safeParse({}).success).toBe(false);
    expect(updateOrderSchema.safeParse({ pickup_status: "picked_up" }).success).toBe(true);
  });
});
