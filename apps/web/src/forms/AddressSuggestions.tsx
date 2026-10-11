import type { RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Button } from "@wkc/ui";
import {
  createAddressSearchFlow,
  type AddressSuggestion,
  type SuggestedAddress,
} from "../lib/address-autocomplete.ts";
import { loadAppleAddressSearch } from "../lib/apple-maps.ts";

const token = import.meta.env.VITE_APPLE_MAPS_TOKEN?.trim();
const addressFields = new Set(["line1", "line2", "city", "state", "zip"]);

interface AddressSuggestionsProps {
  formRef: RefObject<HTMLFormElement>;
  onAddress: (address: SuggestedAddress) => void;
}

export function AddressSuggestions({ formRef, onAddress }: AddressSuggestionsProps) {
  const input = useRef<HTMLInputElement>(null);
  const flow = useRef<ReturnType<typeof createAddressSearchFlow>>();
  const [requested, setRequested] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState("");

  useLayoutEffect(() => {
    if (!token || !requested) return;
    let mounted = true;
    const form = formRef.current;
    const onManualInput = (event: Event) => {
      if (
        (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) &&
        addressFields.has(event.target.name)
      )
        flow.current?.invalidate();
    };
    const onSubmit = () => flow.current?.invalidate();
    const fail = () => {
      if (!mounted) return;
      mounted = false;
      setStatus("error");
      setMessage("Address suggestions are unavailable. Enter your address below.");
    };
    form?.addEventListener("input", onManualInput);
    form?.addEventListener("change", onManualInput);
    form?.addEventListener("submit", onSubmit);
    const dialog = form?.closest("dialog");
    dialog?.addEventListener("cancel", onSubmit);
    dialog?.addEventListener("close", onSubmit);
    const timeout = setTimeout(fail, 10000);
    loadAppleAddressSearch(token)
      .then((client) => {
        clearTimeout(timeout);
        if (!mounted) return;
        flow.current = createAddressSearchFlow(
          client,
          (suggestions) => {
            setResults(suggestions);
            setActive(-1);
          },
          onAddress,
          setMessage,
        );
        setStatus("ready");
      })
      .catch(fail);
    return () => {
      mounted = false;
      clearTimeout(timeout);
      flow.current?.dispose();
      flow.current = undefined;
      form?.removeEventListener("input", onManualInput);
      form?.removeEventListener("change", onManualInput);
      form?.removeEventListener("submit", onSubmit);
      dialog?.removeEventListener("cancel", onSubmit);
      dialog?.removeEventListener("close", onSubmit);
    };
  }, [requested, formRef, onAddress]);

  useEffect(() => {
    if (status !== "ready") return;
    const focused = document.activeElement;
    // A slow SDK must not interrupt a customer who has started typing manually.
    if (
      focused instanceof HTMLInputElement ||
      focused instanceof HTMLSelectElement ||
      focused instanceof HTMLTextAreaElement
    )
      return;
    input.current?.focus();
  }, [status]);

  useEffect(() => {
    if (active >= 0)
      document.getElementById(`address-result-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function select(suggestion: AddressSuggestion) {
    setQuery(suggestion.displayLines[0] ?? "");
    void flow.current?.select(suggestion);
  }

  if (!token) return null;
  return (
    <div class="address-suggestions">
      <p class="address-search-title">Find your pickup address</p>
      {status === "idle" && (
        <Button
          variant="secondary"
          onClick={() => {
            setStatus("loading");
            setRequested(true);
          }}
        >
          Find address with Apple Maps
        </Button>
      )}
      {status === "loading" && <p role="status">Loading address search…</p>}
      {status === "ready" && (
        <>
          <label class="visually-hidden" for="address-search">
            Find your pickup address
          </label>
          <input
            class="input"
            ref={input}
            id="address-search"
            value={query}
            role="combobox"
            autocomplete="off"
            aria-autocomplete="list"
            aria-expanded={results.length > 0}
            aria-controls="address-results"
            aria-activedescendant={active >= 0 ? `address-result-${active}` : undefined}
            aria-describedby="address-search-hint address-search-status"
            placeholder="Start typing your street address"
            maxLength={120}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              flow.current?.update(event.currentTarget.value);
            }}
            onBlur={() => flow.current?.invalidate()}
            onKeyDown={(event) => {
              if ((event.key === "ArrowDown" || event.key === "ArrowUp") && results.length) {
                event.preventDefault();
                setActive(
                  event.key === "ArrowDown"
                    ? (active + 1) % results.length
                    : active < 0
                      ? results.length - 1
                      : (active - 1 + results.length) % results.length,
                );
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (active >= 0 && results[active]) select(results[active]);
              } else if (event.key === "Escape" && results.length) {
                event.preventDefault();
                event.stopPropagation();
                flow.current?.invalidate();
              }
            }}
          />
          <ul
            id="address-results"
            role="listbox"
            aria-label="Address suggestions"
            class="address-results"
            hidden={!results.length}
          >
            {results.map((result, index) => (
              <li
                id={`address-result-${index}`}
                key={index}
                role="option"
                aria-selected={active === index}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => select(result)}
              >
                <strong>{result.displayLines[0]}</strong>
                <span>{result.displayLines.slice(1).join(", ")}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p class="field-hint" id="address-search-hint">
        Search by{" "}
        <a href="https://maps.apple.com/" target="_blank" rel="noopener noreferrer">
          Apple Maps
        </a>
        . You can also type your address below.
      </p>
      <p class="field-hint" id="address-search-status" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
