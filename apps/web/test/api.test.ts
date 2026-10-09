import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, parseSiteConfig } from "../src/lib/api.ts";

function respond(body: string, init: { status?: number; type?: string } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(body, {
          status: init.status ?? 200,
          headers: { "content-type": init.type ?? "application/json" },
        }),
    ),
  );
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("expected the request to fail");
}

const INDEX_HTML = '<!doctype html><html><body><div id="app"></div></body></html>';

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("treats index.html served with a 200 (static hosting without an API) as unavailable", async () => {
    respond(INDEX_HTML, { type: "text/html" });
    const error = await failure(api.config());
    expect(error.kind).toBe("invalid_response");
    expect(error.message).toMatch(/temporarily unavailable/);
  });

  it("never reports a non-API response as a successful waitlist signup", async () => {
    respond(INDEX_HTML, { type: "text/html" });
    const error = await failure(
      api.joinWaitlist({
        experiment_id: "experiment-001",
        source: "direct",
        acquisition_channel: "direct",
        name: "A",
        email: "a@example.com",
        service_interest: "always_sharp",
        cadence: "monthly",
        notes: undefined,
      }),
    );
    expect(error.kind).toBe("invalid_response");
  });

  it("reports a network failure in plain language", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const error = await failure(api.config());
    expect(error.kind).toBe("network");
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/could not reach the booking service/);
  });

  it("does not show API error codes or status lines to customers", async () => {
    respond(JSON.stringify({ error: "internal_error" }), { status: 500 });
    const server = await failure(api.getOrder("abc"));
    expect(server.message).not.toMatch(/internal_error|500/);
    expect(server.kind).toBe("server");

    respond("<html>502 Bad Gateway</html>", { status: 502, type: "text/html" });
    const gateway = await failure(api.getOrder("abc"));
    expect(gateway.message).not.toMatch(/502|Bad Gateway/);
    expect(gateway.message).toMatch(/temporarily unavailable/);

    respond("Method Not Allowed", { status: 405, type: "text/plain" });
    const method = await failure(api.getOrder("abc"));
    expect(method.message).toMatch(/temporarily unavailable/);
  });

  it("keeps field issues from a 400", async () => {
    respond(
      JSON.stringify({ error: "invalid_request", issues: ["care_day: not an available care day"] }),
      { status: 400 },
    );
    const error = await failure(api.getOrder("abc"));
    expect(error.issues).toEqual(["care_day: not an available care day"]);
    expect(error.message).toBe("Please check the highlighted fields.");
  });

  it("maps an API 404 to a readable message", async () => {
    respond(JSON.stringify({ error: "not_found" }), { status: 404 });
    const error = await failure(api.getOrder("abc"));
    expect(error.message).toBe("We could not find that order.");
  });

  describe("createOrder", () => {
    const input = {} as Parameters<typeof api.createOrder>[0];
    const good = {
      order_id: "o1",
      experiment_id: "experiment-001",
      quote: { total_cents: 3900 },
    };

    it("rejects a response with no checkout_url instead of navigating to undefined", async () => {
      respond(JSON.stringify(good), { status: 201 });
      expect((await failure(api.createOrder(input))).kind).toBe("invalid_response");
    });

    it("rejects a checkout_url that is not http(s)", async () => {
      respond(JSON.stringify({ ...good, checkout_url: "javascript:alert(1)" }), { status: 201 });
      expect((await failure(api.createOrder(input))).kind).toBe("invalid_response");
    });

    it("rejects a response with no quote", async () => {
      respond(JSON.stringify({ ...good, quote: undefined, checkout_url: "https://x.test/pay" }), {
        status: 201,
      });
      expect((await failure(api.createOrder(input))).kind).toBe("invalid_response");
    });

    it("returns a well-formed result", async () => {
      respond(JSON.stringify({ ...good, checkout_url: "https://checkout.stripe.com/c/pay/cs_1" }), {
        status: 201,
      });
      const result = await api.createOrder(input);
      expect(result.checkout_url).toBe("https://checkout.stripe.com/c/pay/cs_1");
    });
  });

  it("rejects an order body that lacks the fields the thank-you page reads", async () => {
    respond(JSON.stringify({}));
    expect((await failure(api.getOrder("abc"))).kind).toBe("invalid_response");
  });
});

describe("parseSiteConfig", () => {
  it("accepts a valid config", () => {
    expect(parseSiteConfig({ care_days: ["2026-10-13"], payments_enabled: true })).toEqual({
      care_days: ["2026-10-13"],
      payments_enabled: true,
    });
  });

  it.each([
    ["not an object", "<html>"],
    ["an array", []],
    ["missing payments_enabled", { care_days: ["2026-10-13"] }],
    ["payments_enabled as a string", { care_days: [], payments_enabled: "true" }],
    ["care_days not an array", { care_days: "2026-10-13", payments_enabled: true }],
    ["a care day that is not a date", { care_days: ["tuesday"], payments_enabled: true }],
  ])("rejects %s", (_name, value) => {
    expect(() => parseSiteConfig(value)).toThrow(ApiError);
  });
});
