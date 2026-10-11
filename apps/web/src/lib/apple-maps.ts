import { load } from "@apple/mapkit-loader";
import type { AddressSearch } from "./address-autocomplete.ts";

let library: ReturnType<typeof load> | undefined;

/** Load only search services, on customer request; share the SDK across reopened forms. */
export async function loadAppleAddressSearch(token: string): Promise<AddressSearch> {
  if (!token.trim()) throw new Error("Address search is not configured.");
  library ??= load({ token, version: "6", language: "en-US", libraries: ["services"] });
  const mapkit = await library;
  return new mapkit.Search({
    coordinate: { latitude: 40.6584, longitude: -74.3474 },
    language: "en-US",
    limitToCountries: "US",
    includeAddresses: true,
    includePointsOfInterest: false,
    includePhysicalFeatures: false,
    includeQueries: false,
  });
}
