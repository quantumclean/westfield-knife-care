import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ADMIN_KEY, WEBHOOK_SECRET, json, makeDeps, readJson, validOrder } from "./helpers.ts";

const admin = { headers: { "x-admin-key": ADMIN_KEY } };
let seq = 0;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const visitorId = (value: string) =>
  `00000000-0000-4000-8000-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;

type App = ReturnType<typeof makeDeps>["app"];

interface Visit {
  visitor: string;
  arm: "a" | "b";
  device?: "mobile" | "desktop";
  steps?: [string, Record<string, unknown>?][];
}

/** One page load: a page_view plus the given events, all sharing a view id. */
async function visit(app: App, { visitor, arm, device = "mobile", steps = [] }: Visit) {
  const view_id = id();
  const base = {
    v: 2,
    view_id,
    experiment_id: arm === "a" ? "experiment-001" : "experiment-002",
    source: arm === "a" ? "flyer-a" : "flyer-b",
    acquisition_channel: "print",
    visitor_id: visitorId(visitor),
    owner: "f".repeat(64),
    route: `/${arm}`,
    device,
    viewport: device === "mobile" ? "xs" : "lg",
  };
  const events = [["page_view", {}], ...steps].map(([name, props]) => ({
    ...base,
    event_id: id(),
    name,
    props: props ?? {},
  }));
  const res = await app.request("/api/events", json("POST", { events }));
  expect(res.status).toBe(204);
}

async function paidOrder(app: App, visitor: string, experiment = "experiment-001") {
  const created = await readJson(
    await app.request(
      "/api/orders",
      json("POST", { ...validOrder, experiment_id: experiment, visitor_id: visitorId(visitor) }),
    ),
  );
  await app.request(
    "/api/webhooks/stripe",
    json(
      "POST",
      {
        type: "checkout_completed",
        order_id: created.order_id,
        checkout_session_id: "cs_fake_" + created.order_id,
        payment_intent_id: "pi_" + created.order_id,
        amount_cents: created.quote.total_cents,
        currency: "usd",
      },
      { "stripe-signature": WEBHOOK_SECRET },
    ),
  );
  return created.order_id as string;
}

const booking: [string, Record<string, unknown>?][] = [
  ["cta_click", { cta: "sharpen", location: "hero" }],
  ["booking_opened", { location: "hero" }],
  ["booking_step", { step: "details" }],
];

async function scenario() {
  const { app, deps } = makeDeps();
  // Arm A: 6 mobile + 6 desktop visitors. Mobile struggles at details; desktop submits.
  for (let i = 0; i < 6; i++) {
    await visit(app, {
      visitor: `visitor-a-mob-${i}`,
      arm: "a",
      device: "mobile",
      steps:
        i < 4
          ? [...booking, ["form_error", { form: "booking", fields: "phone", kinds: "format" }]]
          : [],
    });
    await visit(app, {
      visitor: `visitor-a-desk-${i}`,
      arm: "a",
      device: "desktop",
      steps:
        i < 4
          ? [
              ...booking,
              ["booking_submitted", { knives: 4, total_cents: 3900 }],
              ["checkout_started", { total_cents: 3900 }],
            ]
          : [["scroll_depth", { percent: 50 }]],
    });
  }
  // Arm B: 5 visitors; one claims a completed checkout in the browser but has no paid order.
  for (let i = 0; i < 5; i++) {
    await visit(app, {
      visitor: `visitor-b-${i}`,
      arm: "b",
      steps: i === 0 ? [...booking, ["checkout_completed", { total_cents: 4900 }]] : [],
    });
  }
  const orderIds = [
    await paidOrder(app, "visitor-a-desk-0"),
    await paidOrder(app, "visitor-a-desk-1"),
  ];
  return { app, deps, orderIds };
}

async function insights(app: App, query = "") {
  const res = await app.request(`/api/admin/insights${query}`, admin);
  expect(res.status).toBe(200);
  return readJson(res);
}

describe("GET /api/admin/insights", () => {
  it("compares /a ($39/4) and /b ($49/5) with paid orders from order state only", async () => {
    const { app } = await scenario();
    const report = await insights(app);
    const [a, b] = report.arms;
    expect(a).toMatchObject({ experiment_id: "experiment-001", flyer: "/a" });
    expect(b).toMatchObject({ experiment_id: "experiment-002", flyer: "/b" });

    expect(a.funnel).toMatchObject({
      visited: 12,
      cta_click: 8,
      booking_opened: 8,
      booking_details: 8,
      booking_submitted: 4,
      checkout_started: 4,
      paid: 2,
    });
    expect(a.outcomes).toMatchObject({
      orders_paid: 2,
      revenue_cents: 7800,
      revenue_per_visitor_cents: 650,
    });
    // B's browser said "checkout completed", but no order was paid: it does not count.
    expect(b.funnel.paid).toBe(0);
    expect(b.outcomes.revenue_cents).toBe(0);
  });

  it("shows mobile visitors struggling where desktop visitors do not", async () => {
    const { app } = await scenario();
    // Only 4 visitors per device reached details, so lower the threshold to name the device.
    const [a] = (await insights(app, "?min_count=4")).arms;
    const mobile = a.by_device.find((r: { key: string }) => r.key === "mobile");
    const desktop = a.by_device.find((r: { key: string }) => r.key === "desktop");
    expect(mobile).toMatchObject({ visitors: 6, booking_opened: 4, booking_submitted: 0, paid: 0 });
    expect(desktop).toMatchObject({
      visitors: 6,
      booking_opened: 4,
      booking_submitted: 4,
      paid: 2,
    });
    expect(a.booking.form_error_fields).toEqual({ phone: 4 });
    expect(a.booking.form_error_kinds).toEqual({ format: 4 });
    const details = a.drop_offs.find((d: { from: string }) => d.from === "booking_details");
    expect(details).toMatchObject({
      to: "booking_submitted",
      lost: 4,
      worst_device: { device: "mobile", conversion: 0, visitors: 4 },
    });
  });

  it("suppresses small breakdown cells, unless the operator lowers the threshold", async () => {
    const { app } = await scenario();
    const [, b] = (await insights(app)).arms;
    expect(b.by_device[0]).toMatchObject({ key: "mobile", visitors: 5 });
    const strict = (await insights(app, "?min_count=6")).arms[1];
    expect(strict.by_device[0]).toMatchObject({ visitors: null, paid: null, suppressed: true });
    expect(strict.funnel.visited).toBe(5); // totals are never suppressed
  });

  it("measures bounces per page load and ignores duplicate once-per-view events", async () => {
    const { app } = makeDeps();
    const base = {
      v: 2,
      owner: "f".repeat(64),
      experiment_id: "experiment-001",
      visitor_id: "00000000-0000-4000-8000-000000000001",
      route: "/a",
      device: "mobile",
      viewport: "xs",
    };
    const bounced = { ...base, view_id: id() };
    const engaged = { ...base, view_id: id() };
    for (const events of [
      [
        { ...bounced, event_id: id(), name: "page_view" },
        {
          ...bounced,
          event_id: id(),
          name: "page_engagement",
          props: { time: "<10s", max_scroll: 0 },
        },
      ],
      [
        { ...engaged, event_id: id(), name: "page_view" },
        { ...engaged, event_id: id(), name: "scroll_depth", props: { percent: 50 } },
        { ...engaged, event_id: id(), name: "scroll_depth", props: { percent: 50 } },
      ],
    ])
      expect((await app.request("/api/events", json("POST", { events }))).status).toBe(204);
    const report = await insights(app);
    expect(report.duplicates_ignored).toBe(1);
    expect(report.arms[0].engagement).toMatchObject({ landing_views: 2, bounce_rate: 0.5 });
    expect(report.arms[0].engagement.scroll_depth["50"]).toBe(1);
  });

  it("never outputs visitor ids, order ids or customer details", async () => {
    const { app, orderIds } = await scenario();
    for (const query of ["", "?format=markdown&min_count=1"]) {
      const text = await (await app.request(`/api/admin/insights${query}`, admin)).text();
      expect(text).not.toMatch(/visitor-/);
      for (const order of orderIds) expect(text).not.toContain(order);
      expect(text).not.toContain(validOrder.customer.email);
      expect(text).not.toContain(validOrder.customer.address.line1);
    }
  });

  it("renders a Markdown report", async () => {
    const { app } = await scenario();
    const res = await app.request("/api/admin/insights?format=markdown", admin);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("## Arms side by side");
    expect(text).toContain("experiment-001 (/a)");
    expect(text).toContain("booking_details → booking_submitted: 4 lost");
  });

  it("requires the admin key and validates parameters", async () => {
    const { app } = makeDeps();
    expect((await app.request("/api/admin/insights")).status).toBe(401);
    for (const q of ["?min_count=0", "?min_count=abc", "?since=yesterday"]) {
      expect((await app.request(`/api/admin/insights${q}`, admin)).status).toBe(400);
    }
  });

  it("limits the report to a window", async () => {
    const { app, clock } = makeDeps();
    await visit(app, { visitor: "visitor-early-1", arm: "a" });
    clock.now = new Date("2026-10-05T12:00:00Z");
    await visit(app, { visitor: "visitor-late-01", arm: "a" });
    const report = await insights(app, "?since=2026-10-01T00:00:00Z");
    expect(report.arms[0].funnel.visited).toBe(1);
  });
});
