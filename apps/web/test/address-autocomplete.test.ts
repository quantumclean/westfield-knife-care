import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addressFromPlace,
  createAddressSearchFlow,
  type AddressSuggestion,
  type AppleStreetAddress,
} from "../src/lib/address-autocomplete.ts";

const place: AppleStreetAddress = {
  countryCode: "US",
  subThoroughfare: "123",
  thoroughfare: "Sample Way",
  locality: "Westfield",
  subLocality: null,
  administrativeAreaCode: "NJ",
  postCode: "07090",
};
const expected = { line1: "123 Sample Way", city: "Westfield", state: "NJ", zip: "07090" };
const suggestion: AddressSuggestion = {
  displayLines: ["123 Sample Way", "Westfield, NJ"],
  id: null,
  alternateIds: null,
  coordinate: null,
  name: null,
  administrativeArea: null,
  administrativeAreaCode: null,
  locality: null,
  postCode: null,
  subLocality: null,
  thoroughfare: null,
  subThoroughfare: null,
  fullThoroughfare: null,
  areasOfInterest: null,
  dependentLocalities: null,
};
const flows: ReturnType<typeof createAddressSearchFlow>[] = [];
function harness() {
  const client = {
    autocomplete: vi.fn(async (_query: string, _options: { signal: AbortSignal }) => ({
      results: [suggestion],
    })),
    search: vi.fn(async (_query: AddressSuggestion, _options: { signal: AbortSignal }) => ({
      places: [place],
    })),
  };
  const suggestions = vi.fn();
  const apply = vi.fn();
  const message = vi.fn();
  const flow = createAddressSearchFlow(client, suggestions, apply, message);
  flows.push(flow);
  return { client, suggestions, apply, message, flow };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Apple pickup address search", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    flows.splice(0).forEach((flow) => flow.dispose());
    vi.useRealTimers();
  });

  it("maps complete US addresses, trims fields, and preserves ZIP+4", () => {
    expect(addressFromPlace(place)).toEqual(expected);
    expect(
      addressFromPlace({
        ...place,
        subThoroughfare: " 123 ",
        administrativeAreaCode: "nj",
        postCode: "07090-1234",
      }),
    ).toEqual({ ...expected, zip: "07090-1234" });
    expect(addressFromPlace({ ...place, locality: null, subLocality: "Westfield" })).toEqual(
      expected,
    );
  });

  it.each([
    "countryCode",
    "subThoroughfare",
    "thoroughfare",
    "locality",
    "administrativeAreaCode",
    "postCode",
  ] as const)("rejects missing %s without mixing partial data into existing fields", (field) =>
    expect(addressFromPlace({ ...place, [field]: null })).toBeNull(),
  );

  it("rejects foreign addresses, absent places, invalid states and ZIPs", () => {
    expect(addressFromPlace({ ...place, countryCode: "CA" })).toBeNull();
    expect(addressFromPlace({ ...place, administrativeAreaCode: "New Jersey" })).toBeNull();
    expect(addressFromPlace({ ...place, postCode: "invalid" })).toBeNull();
    expect(addressFromPlace(undefined)).toBeNull();
  });

  it("debounces typing and sends only the latest trimmed query", async () => {
    const { flow, client } = harness();
    flow.update("123");
    await vi.advanceTimersByTimeAsync(200);
    flow.update(" 123 Sample ");
    await vi.advanceTimersByTimeAsync(349);
    expect(client.autocomplete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(client.autocomplete).toHaveBeenCalledTimes(1);
    expect(client.autocomplete).toHaveBeenCalledWith("123 Sample", {
      signal: expect.any(AbortSignal),
    });
  });

  it("skips very short or oversized queries and bounds displayed suggestions", async () => {
    const { flow, client, suggestions } = harness();
    for (const text of ["", "12", "x".repeat(121)]) {
      flow.update(text);
      await vi.advanceTimersByTimeAsync(350);
    }
    expect(client.autocomplete).not.toHaveBeenCalled();
    client.autocomplete.mockResolvedValueOnce({
      results: [
        { ...suggestion, displayLines: [" "] },
        ...Array.from({ length: 12 }, () => suggestion),
      ],
    });
    flow.update("123 Sample");
    await vi.advanceTimersByTimeAsync(350);
    expect(suggestions).toHaveBeenLastCalledWith(Array.from({ length: 5 }, () => suggestion));
  });

  it("resolves the original selected Apple result and applies all address fields together", async () => {
    const { flow, client, apply, message } = harness();
    await flow.select(suggestion);
    expect(client.search).toHaveBeenCalledWith(suggestion, { signal: expect.any(AbortSignal) });
    expect(apply).toHaveBeenCalledWith(expected);
    expect(message).toHaveBeenLastCalledWith(expect.stringContaining("Check the details"));
  });

  it.each([
    { kind: "empty", places: [] },
    { kind: "incomplete", places: [{ ...place, postCode: null }] },
    { kind: "ambiguous", places: [place, place] },
  ])("keeps manual data for a $kind lookup", async ({ places }) => {
    const { flow, client, apply, message } = harness();
    client.search.mockResolvedValueOnce({ places });
    await flow.select(suggestion);
    expect(apply).not.toHaveBeenCalled();
    expect(message).toHaveBeenLastCalledWith(expect.stringContaining("complete street address"));
  });

  it("falls back after quota or authorization errors without exposing SDK details", async () => {
    const { flow, client, message, apply } = harness();
    client.autocomplete.mockRejectedValueOnce(
      new Error("Too Many Requests: synthetic internal detail"),
    );
    flow.update("123 Sample");
    await vi.advanceTimersByTimeAsync(350);
    expect(message).toHaveBeenLastCalledWith(
      "Address suggestions are unavailable. Enter your address below.",
    );
    client.search.mockRejectedValueOnce(new Error("Not Authorized: synthetic internal detail"));
    await flow.select(suggestion);
    expect(apply).not.toHaveBeenCalled();
    expect(message).toHaveBeenLastCalledWith(
      "Address suggestions are unavailable. Enter your address below.",
    );
    await flow.select(suggestion);
    expect(apply).toHaveBeenCalledWith(expected);
  });

  it("aborts an old autocomplete query and ignores its late reply", async () => {
    const { flow, client, suggestions } = harness();
    const old = deferred<{ results: AddressSuggestion[] }>();
    client.autocomplete.mockReturnValueOnce(old.promise);
    flow.update("123 Old");
    await vi.advanceTimersByTimeAsync(350);
    const signal = client.autocomplete.mock.calls[0]![1].signal;
    flow.update("456 New");
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(350);
    old.resolve({ results: [{ ...suggestion, displayLines: ["Obsolete"] }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(suggestions).toHaveBeenLastCalledWith([suggestion]);
  });

  it.each(["invalidate", "dispose"] as const)(
    "ignores late details after %s (manual edit, submission, blur or unmount)",
    async (action) => {
      const { flow, client, apply } = harness();
      const details = deferred<{ places: AppleStreetAddress[] }>();
      client.search.mockReturnValueOnce(details.promise);
      const pending = flow.select(suggestion);
      const signal = client.search.mock.calls[0]![1].signal;
      flow[action]();
      expect(signal.aborted).toBe(true);
      details.resolve({ places: [place] });
      await pending;
      expect(apply).not.toHaveBeenCalled();
    },
  );

  it("times out stuck details and ignores a subsequent late success", async () => {
    const { flow, client, apply, message } = harness();
    const details = deferred<{ places: AppleStreetAddress[] }>();
    client.search.mockReturnValueOnce(details.promise);
    const pending = flow.select(suggestion);
    await vi.advanceTimersByTimeAsync(5000);
    expect(client.search.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(message).toHaveBeenLastCalledWith(expect.stringContaining("Enter your address below"));
    details.resolve({ places: [place] });
    await pending;
    expect(apply).not.toHaveBeenCalled();
  });

  it("clears pending debounce timers when the customer leaves search", async () => {
    const { flow, client } = harness();
    flow.update("123 Sample");
    flow.invalidate();
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.autocomplete).not.toHaveBeenCalled();
  });
});
