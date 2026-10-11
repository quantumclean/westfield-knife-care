import type { Place, SearchAutocompleteResult } from "@apple/mapkit-loader";
import { addressSchema } from "@wkc/shared";

export type AddressSuggestion = SearchAutocompleteResult;
export type AppleStreetAddress = Pick<
  Place,
  | "countryCode"
  | "subThoroughfare"
  | "thoroughfare"
  | "locality"
  | "subLocality"
  | "administrativeAreaCode"
  | "postCode"
>;
export interface SuggestedAddress {
  line1: string;
  city: string;
  state: string;
  zip: string;
}
export interface AddressSearch {
  autocomplete(
    query: string,
    options: { signal: AbortSignal },
  ): Promise<{ results: AddressSuggestion[] }>;
  search(
    query: AddressSuggestion,
    options: { signal: AbortSignal },
  ): Promise<{ places: AppleStreetAddress[] }>;
}

/** Accept complete US street addresses without mixing partial results with existing fields. */
export function addressFromPlace(place: AppleStreetAddress | undefined): SuggestedAddress | null {
  const number = place?.subThoroughfare?.trim();
  const street = place?.thoroughfare?.trim();
  if (place?.countryCode?.toUpperCase() !== "US" || !number || !street) return null;
  const parsed = addressSchema.safeParse({
    line1: `${number} ${street}`,
    city: place.locality ?? place.subLocality ?? "",
    state: place.administrativeAreaCode ?? "",
    zip: place.postCode ?? "",
  });
  if (!parsed.success) return null;
  const { line1, city, state, zip } = parsed.data;
  return { line1, city, state, zip };
}

const UNAVAILABLE = "Address suggestions are unavailable. Enter your address below.";

/** Debounce queries and ignore late replies after edits, submission, blur, or unmount. */
export function createAddressSearchFlow(
  client: AddressSearch,
  onSuggestions: (results: AddressSuggestion[]) => void,
  onAddress: (address: SuggestedAddress) => void,
  onMessage: (message: string) => void,
) {
  let version = 0;
  let disposed = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | undefined;

  function cancel() {
    version++;
    clearTimeout(debounce);
    clearTimeout(deadline);
    abort?.abort();
  }

  async function request<T>(
    fetch: (signal: AbortSignal) => Promise<T>,
    apply: (value: T) => void,
    message: string,
  ) {
    cancel();
    if (disposed) return;
    const current = version;
    const controller = new AbortController();
    abort = controller;
    onMessage(message);
    const timeout = setTimeout(() => {
      if (disposed || current !== version) return;
      cancel();
      onSuggestions([]);
      onMessage(UNAVAILABLE);
    }, 5000);
    deadline = timeout;
    try {
      const result = await fetch(controller.signal);
      if (!disposed && current === version) apply(result);
    } catch {
      if (!disposed && current === version) {
        onSuggestions([]);
        onMessage(UNAVAILABLE);
      }
    } finally {
      clearTimeout(timeout);
      if (abort === controller) {
        abort = undefined;
        deadline = undefined;
      }
    }
  }

  return {
    update(query: string) {
      cancel();
      if (disposed) return;
      onSuggestions([]);
      onMessage("");
      const text = query.trim();
      if (text.length < 3 || text.length > 120) return;
      debounce = setTimeout(() => {
        void request(
          (signal) => client.autocomplete(text, { signal }),
          ({ results }) => {
            const visible = results
              .filter((result) => result.displayLines.some((line) => line.trim()))
              .slice(0, 5);
            onSuggestions(visible);
            onMessage(
              visible.length
                ? "Choose an address from the suggestions."
                : "No matching addresses. Enter your address below.",
            );
          },
          "Searching addresses…",
        );
      }, 350);
    },
    async select(suggestion: AddressSuggestion) {
      if (disposed) return;
      onSuggestions([]);
      await request(
        (signal) => client.search(suggestion, { signal }),
        ({ places }) => {
          const address = places.length === 1 ? addressFromPlace(places[0]) : null;
          if (!address) {
            onMessage("Please enter the complete street address below.");
            return;
          }
          onAddress(address);
          onMessage("Address filled. Check the details below and add your apartment if needed.");
        },
        "Finding the address…",
      );
    },
    invalidate() {
      cancel();
      if (!disposed) {
        onSuggestions([]);
        onMessage("");
      }
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
