import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  load: vi.fn(),
  Search: vi.fn(function () {
    return {};
  }),
}));
vi.mock("@apple/mapkit-loader", () => ({ load: sdk.load }));

describe("optional Apple Maps services", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sdk.load.mockResolvedValue({ Search: sdk.Search });
  });

  it("does not load the SDK without a token", async () => {
    const { loadAppleAddressSearch } = await import("../src/lib/apple-maps.ts");
    await expect(loadAppleAddressSearch(" ")).rejects.toThrow("not configured");
    expect(sdk.load).not.toHaveBeenCalled();
  });

  it("loads only services once and creates US address-only searches on reopening", async () => {
    const { loadAppleAddressSearch } = await import("../src/lib/apple-maps.ts");
    await Promise.all([
      loadAppleAddressSearch("synthetic-browser-token"),
      loadAppleAddressSearch("synthetic-browser-token"),
    ]);
    expect(sdk.load).toHaveBeenCalledTimes(1);
    expect(sdk.load).toHaveBeenCalledWith({
      token: "synthetic-browser-token",
      version: "6",
      language: "en-US",
      libraries: ["services"],
    });
    expect(sdk.Search).toHaveBeenCalledTimes(2);
    expect(sdk.Search).toHaveBeenLastCalledWith({
      coordinate: { latitude: 40.6584, longitude: -74.3474 },
      language: "en-US",
      limitToCountries: "US",
      includeAddresses: true,
      includePointsOfInterest: false,
      includePhysicalFeatures: false,
      includeQueries: false,
    });
  });
});
