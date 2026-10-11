# Optional Apple Maps address suggestions

Step 2 of the two-step booking sheet can find US street addresses using Apple MapKit JS 6. The optional search sits immediately before the pickup-address fields. It updates the controlled Preact contact state (street, city, state, and ZIP) only after the customer selects a complete, unambiguous address. The displayed fields, tab-only checkout draft, and submitted order therefore share the same address. Existing apartment/unit details and notes are preserved. The customer can review and edit all fields before checkout.

## Cost and account requirements

Apple includes **25,000 service calls per day per Apple Developer Program membership**, shared across MapKit JS and Maps Server API usage by the team. Autocomplete queries and the selected-address lookup consume service calls; this is not a limit of 25,000 customers. Map views have a separate allowance, and this integration creates no map.

If the owner already has an active paid membership, using its included allowance adds no Maps usage charge. A free developer account alone is insufficient; new enrollment normally costs $99 per membership year. This change does not enroll an account, create subscriptions, purchase extra capacity, or modify billing. Apple requires contacting them for additional capacity; quota failures fall back to manual entry here.

Queries wait for 350 ms of quiet typing and at least three characters. Only five suggestions are displayed. These measures reduce requests; they cannot reserve a portion of the team-wide daily allowance for this website. Monitor total usage in Apple's Maps dashboard, especially if the membership serves other applications.

## Setup when ready

1. In the existing Apple Developer account, open **Certificates, Identifiers & Profiles → Services → Maps → Configure → Tokens → +**.
2. Create a **MapKit JS** token with **Domain** restrictions for the exact website domains that will use it. Use separate tokens for local development and public environments. Choose an appropriate expiry and rotation process; Apple also offers a no-expiration option.
3. Set `VITE_APPLE_MAPS_TOKEN` at build time. Locally, Vite reads this from `apps/web/.env.local`, not the repository root `.env`. Use a development token that allows the local origin.
4. Validate real address suggestions in the native booking dialog on Safari and Chrome before enabling it publicly. No actual Apple token was available for this PR's tests.

The browser token is intentionally delivered to the browser and must be domain restricted. **Never put an Apple private signing key, Apple account password, or server token in a Vite variable or the repository.** This integration needs no private signing key or new backend endpoint.

Without a token, customers see the existing manual address fields, and the site makes no Apple requests. With a token, Apple loads only after the customer clicks **Find address with Apple Maps**. A blocked SDK, failed authorization, exhausted quota, or timeout leaves manual booking available. Refresh the page to retry a failed SDK load.

## Data and behavior

- Apple receives the separate search query when the customer uses address search. Name, email, phone, apartment field, and notes are not sent to Apple by this integration. Search text and result payloads are not logged or tracked in analytics. Customers can still type sensitive information into the search field themselves.
- US-only address search favors the Westfield area. This is a search hint, not a service-area eligibility check or proof that an address is deliverable.
- Suggested ZIPs are checked against the same service-area rules as manual entry. An out-of-area ZIP replaces checkout with the prefilled waitlist. Address normalization accepts a complete out-of-area address for this purpose; the shared order schema and API still reject orders outside the service area. No backend validation is relaxed.
- Incomplete, foreign, ambiguous, or invalid results do not overwrite any fields. Existing form/schema validation still applies to the final submitted address.
- Arrow keys and Enter select a suggestion; Escape dismisses an open list. Enter in the search field does not submit a booking. Manual address edits, submission, leaving search, and closing the dialog cancel pending work and prevent late replies from overwriting data.
- SDK loading has a ten-second UI timeout; search requests have a five-second timeout and use AbortSignals. Pending debounce timers and requests are canceled when obsolete.
- Safari's saved-contact autofill remains available through existing native `autocomplete` attributes. Suggestions also work on supported Android and desktop browsers; no customer Apple account is required.

No database migration is required. No API limits, Stripe payment transitions, flyer prices, infrastructure settings, or deployments change.

## Other Apple features without a new service subscription

The booking pass from PR #26 already includes a downloadable pickup calendar event. iPhone home-screen support remains a separate follow-up that does not require a paid API. Apple Pay should remain integrated through Stripe Checkout if enabled later; Stripe processing charges still apply. An Apple Developer membership does not make payment processing free.

## Verification and limitations

Unit tests exercise address normalization, debounce, request bounds, quota/auth failures, timeout, stale responses, and cancelation. Local browser checks use synthetic addresses and intercept the Apple SDK and booking APIs, so no provider quota, real orders, or live staging traffic is used. Mocked tests verify the app's integration and fallback; they do not certify actual Apple address coverage, token/domain authorization, or real Safari behavior.

`pnpm --filter @wkc/web test` also mounts the actual booking component to verify controlled-state selection, immediate checkout payload and draft, draft restoration, unit preservation, service eligibility, errors, manual autofill attributes, and stale detail responses after edits or close/reopen.

Run `pnpm --filter @wkc/web test:browser` with Playwright Chromium installed for the local browser matrix. It starts a local Vite server with a non-credential placeholder, intercepts the Apple SDK and all API calls, and blocks all other external requests. It covers `/a` and `/b` at desktop, touch mobile and 320px widths in light/dark schemes. Set `WKC_MAPS_DISABLED=1` to test the unconfigured build. For a production preview, build with the same token/disabled choice and set `WKC_BROWSER_PREVIEW=1` when running the matrix. Never supply a real token to these tests.

## Official references

- [Apple Maps allowance and dashboard](https://developer.apple.com/maps/web/)
- [Creating a domain-restricted Maps token](https://developer.apple.com/documentation/mapkitjs/creating-a-maps-token)
- [Loading MapKit JS and the official loader](https://developer.apple.com/documentation/mapkitjs/loading-the-latest-version-of-mapkit-js)
- [Address autocomplete](https://developer.apple.com/documentation/mapkitjs/search/autocomplete)
- [Resolving a selected suggestion](https://developer.apple.com/documentation/mapkitjs/search/search)
- [Supported browsers](https://developer.apple.com/documentation/mapkitjs/browser-support)
- [Program membership fees](https://developer.apple.com/help/account/membership/program-enrollment)
