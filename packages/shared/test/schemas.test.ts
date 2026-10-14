import { describe, expect, it } from "vitest";
import {
  createEventSchema,
  createOrderSchema,
  createWaitlistSchema,
  formatIssues,
  isServedZip,
  serviceTownsLabel,
  updateOrderSchema,
} from "../src/index.ts";

const validOrder = {
  experiment_id: "experiment-001",
  source: "flyer-v1-qr",
  acquisition_channel: "print",
  visitor_id: "00000000-0000-4000-8000-000012345678",
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

describe("service area and contact rules", () => {
  const withCustomer = (patch: Record<string, unknown>, address: Record<string, unknown> = {}) => ({
    ...validOrder,
    customer: {
      ...validOrder.customer,
      ...patch,
      address: { ...validOrder.customer.address, ...address },
    },
  });
  const issues = (input: unknown) => {
    const result = createOrderSchema.safeParse(input);
    return result.success ? [] : formatIssues(result.error);
  };

  it("requires a phone number, because pickups are coordinated by text", () => {
    const { phone, ...noPhone } = validOrder.customer;
    expect(phone).toBeTruthy();
    expect(issues({ ...validOrder, customer: noPhone })).toEqual([
      expect.stringMatching(/^customer\.phone: /),
    ]);
  });

  it("accepts every served ZIP, including ZIP+4", () => {
    for (const zip of [
      "07090",
      "07091",
      "07092",
      "07027",
      "07016",
      "07076",
      "07023",
      "07090-1234",
    ]) {
      expect(issues(withCustomer({}, { zip }))).toEqual([]);
    }
  });

  it("rejects a valid ZIP outside the service area with a readable issue", () => {
    expect(issues(withCustomer({}, { zip: "10001" }))).toEqual([
      "customer.address.zip: We don't pick up in this ZIP code yet.",
    ]);
  });

  it("still reports malformed ZIPs as malformed first", () => {
    expect(issues(withCustomer({}, { zip: "123" }))[0]).toBe(
      "customer.address.zip: Enter a 5-digit ZIP code",
    );
  });

  it("isServedZip and the town list", () => {
    expect(isServedZip(" 07090 ")).toBe(true);
    expect(isServedZip("07060")).toBe(false);
    expect(serviceTownsLabel()).toBe(
      "Westfield, Mountainside, Garwood, Cranford, Scotch Plains and Fanwood",
    );
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

  it("accepts the interest-only mail-in and gift entries, and no address", () => {
    for (const service_interest of ["mail_in", "gift"] as const) {
      const result = createWaitlistSchema.safeParse({
        experiment_id: "experiment-001",
        name: "Grace",
        email: "grace@example.com",
        service_interest,
        cadence: "once",
        notes: "Roughly six knives.",
      });
      expect(result.success, service_interest).toBe(true);
    }
  });

  it("still accepts every Always Sharp rhythm and rejects an unknown interest", () => {
    const base = { experiment_id: "experiment-001", name: "G", email: "g@example.com" };
    for (const cadence of ["weekly", "biweekly", "monthly"] as const) {
      expect(
        createWaitlistSchema.safeParse({ ...base, service_interest: "always_sharp", cadence })
          .success,
      ).toBe(true);
    }
    expect(
      createWaitlistSchema.safeParse({ ...base, service_interest: "shipping", cadence: "once" })
        .success,
    ).toBe(false);
  });
});

describe("createEventSchema", () => {
  const v2 = {
    v: 2,
    event_id: "0b6f8f5e-1c1f-4a52-9b1e-6a4f3f1d2c3b",
    view_id: "5d0e7f1a-2b3c-4d5e-8f90-a1b2c3d4e5f6",
    experiment_id: "experiment-001",
    visitor_id: "00000000-0000-4000-8000-000012345678",
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
