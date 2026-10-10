import { describe, expect, it } from "vitest";
import { applyPaymentEvent } from "../src/services/orders.ts";
import { ADMIN_KEY, json, makeDeps, readJson, validOrder } from "./helpers.ts";

const FEEDBACK = (id: string) => `/api/orders/${id}/feedback`;

/** Create an order through the public API; optionally mark it paid. */
async function setup(options: { paid?: boolean } = { paid: true }) {
  const ctx = makeDeps();
  const create = await ctx.app.request("/api/orders", json("POST", validOrder));
  const created = await readJson(create);
  const order = (await ctx.deps.repo.getOrder(created.order_id))!;
  if (options.paid ?? true) {
    await applyPaymentEvent(ctx.deps, {
      type: "checkout_completed",
      order_id: order.id,
      checkout_session_id: order.stripe_checkout_session_id!,
      payment_intent_id: `pi_${order.id}`,
      amount_cents: order.quote.total_cents,
      currency: order.quote.currency,
    });
  }
  return { ...ctx, created, checkoutUrl: created.checkout_url as string, id: order.id };
}

const stored = async (ctx: Awaited<ReturnType<typeof setup>>) =>
  (await ctx.deps.repo.getOrder(ctx.id))!;

describe("POST /api/orders/:id/feedback authorization", () => {
  it("issues a feedback token in the success URL only", async () => {
    const ctx = await setup();
    const order = await stored(ctx);
    expect(order.feedback_token).toBeTruthy();
    expect(ctx.checkoutUrl).toContain(`ft=${order.feedback_token}`);
    // The fake gateway echoes the success URL inside checkout_url; the response itself has no token field.
    expect(ctx.created).not.toHaveProperty("feedback_token");
    const { checkout_url: _checkout, ...rest } = ctx.created;
    expect(JSON.stringify(rest)).not.toContain(order.feedback_token!);

    const publicView = await ctx.app.request(`/api/orders/${ctx.id}`);
    expect(JSON.stringify(await readJson(publicView))).not.toContain(order.feedback_token!);
  });

  it("gives every order its own token", async () => {
    const ctx = await setup();
    const second = await readJson(await ctx.app.request("/api/orders", json("POST", validOrder)));
    const a = await stored(ctx);
    const b = (await ctx.deps.repo.getOrder(second.order_id))!;
    expect(a.feedback_token).not.toBe(b.feedback_token);
  });

  it.each([
    ["no token", {}],
    ["an empty token", { token: "" }],
    ["a wrong token", { token: "not-the-token" }],
    ["a non-string token", { token: 12345 }],
  ])("rejects %s and leaves the order unchanged", async (_name, extra) => {
    const ctx = await setup();
    const res = await ctx.app.request(
      FEEDBACK(ctx.id),
      json("POST", { repeat_intent: "yes", ...extra }),
    );
    expect([400, 403]).toContain(res.status);
    expect((await stored(ctx)).repeat_intent).toBe("unknown");
  });

  it("rejects another order's token", async () => {
    const ctx = await setup();
    const other = await readJson(await ctx.app.request("/api/orders", json("POST", validOrder)));
    const otherToken = (await ctx.deps.repo.getOrder(other.order_id))!.feedback_token;
    const res = await ctx.app.request(
      FEEDBACK(ctx.id),
      json("POST", { repeat_intent: "no", token: otherToken }),
    );
    expect(res.status).toBe(403);
    expect((await stored(ctx)).repeat_intent).toBe("unknown");
  });

  it("answers an unknown order and a wrong token identically (no enumeration)", async () => {
    const ctx = await setup();
    const unknown = await ctx.app.request(
      FEEDBACK("does-not-exist"),
      json("POST", { repeat_intent: "yes", token: "whatever" }),
    );
    const wrong = await ctx.app.request(
      FEEDBACK(ctx.id),
      json("POST", { repeat_intent: "yes", token: "whatever" }),
    );
    expect(unknown.status).toBe(403);
    expect(wrong.status).toBe(403);
    expect(await readJson(unknown)).toEqual(await readJson(wrong));
  });

  it("accepts the right token on a paid order", async () => {
    const ctx = await setup();
    const { feedback_token } = await stored(ctx);
    const res = await ctx.app.request(
      FEEDBACK(ctx.id),
      json("POST", { repeat_intent: "maybe", token: feedback_token }),
    );
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.repeat_intent).toBe("maybe");
    expect(JSON.stringify(body)).not.toContain(feedback_token!);
    expect((await stored(ctx)).repeat_intent).toBe("maybe");
  });

  it("still refuses feedback on an unpaid order even with the right token", async () => {
    const ctx = await setup({ paid: false });
    const { feedback_token } = await stored(ctx);
    const res = await ctx.app.request(
      FEEDBACK(ctx.id),
      json("POST", { repeat_intent: "yes", token: feedback_token }),
    );
    expect(res.status).toBe(400);
    expect((await stored(ctx)).repeat_intent).toBe("unknown");
  });

  it("is write-once for customers: a second submission cannot overwrite", async () => {
    const ctx = await setup();
    const { feedback_token } = await stored(ctx);
    await ctx.app.request(
      FEEDBACK(ctx.id),
      json("POST", { repeat_intent: "yes", token: feedback_token }),
    );
    const again = await ctx.app.request(
      FEEDBACK(ctx.id),
      json("POST", { repeat_intent: "no", token: feedback_token }),
    );
    expect(again.status).toBe(409);
    expect((await stored(ctx)).repeat_intent).toBe("yes");
  });

  it("does not let a customer overwrite a value the operator recorded", async () => {
    const ctx = await setup();
    const { feedback_token } = await stored(ctx);
    const patch = await ctx.app.request(`/api/admin/orders/${ctx.id}`, {
      ...json("PATCH", { repeat_intent: "no" }),
      headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
    });
    expect(patch.status).toBe(200);
    const res = await ctx.app.request(
      FEEDBACK(ctx.id),
      json("POST", { repeat_intent: "yes", token: feedback_token }),
    );
    expect(res.status).toBe(409);
    expect((await stored(ctx)).repeat_intent).toBe("no");
  });

  it("fails closed for a legacy order that has no token", async () => {
    const ctx = await setup();
    const order = await stored(ctx);
    delete order.feedback_token;
    await ctx.deps.repo.putOrder(order);
    for (const token of [undefined, "", "undefined", "null"]) {
      const res = await ctx.app.request(
        FEEDBACK(ctx.id),
        json("POST", { repeat_intent: "yes", token }),
      );
      expect([400, 403]).toContain(res.status);
    }
    expect((await stored(ctx)).repeat_intent).toBe("unknown");
  });

  it("keeps the token out of the admin-free public order view", async () => {
    const ctx = await setup();
    const res = await ctx.app.request(`/api/orders/${ctx.id}`);
    expect(await readJson(res)).not.toHaveProperty("feedback_token");
  });
});
