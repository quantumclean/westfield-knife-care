# Local browser regression checks

The browser suite runs against a local Vite server at `http://127.0.0.1:5207`.
It exercises desktop light (1280px), mobile dark (390px touch), and small mobile
light (320px touch) with two workers. Both test files intercept API requests and
block all external traffic. Apple search uses synthetic SDK responses. No real
orders, Stripe calls, Apple quota, credentials, customer data, or staging traffic
are needed.

## Run

```sh
pnpm --filter @wkc/web exec playwright install chromium
pnpm --filter @wkc/web test:browser
```

`pnpm --filter @wkc/web e2e` is an alias. If Chromium is already installed on the
machine, set `WKC_BROWSER_EXECUTABLE` to its executable path instead of downloading
another copy. `WKC_BROWSER_CHANNEL` can select an installed Playwright browser
channel; use one selection mechanism at a time. Test artifacts go to the ignored
`.tmp/browser-results` directory.

The existing GitHub Test workflow installs Chromium and runs this suite after
lint, typecheck, unit tests, and build. Deployment workflows are unchanged.

## Coverage

- Kitchen photo loading in its current pricing location, responsive overflow,
  and the frozen `/a` ($39/4) and `/b` ($49/5) flyer prices.
- Booking sheet opening/close focus, a lighter visible close ring, visible
  keyboard focus on knife chips, Step 2 name focus, and the pinned Pay button.
- Manual and Apple-assisted booking, apartment preservation, draft restoration,
  out-of-area waitlist handoff, SDK failures, and late responses after edits or
  closing the dialog.
- Friendly failed/missing order lookup, pending-to-paid polling, paid booking
  pass, and downloading the pickup calendar event.
- Feedback-token removal from the address bar, no token in API/analytics URLs,
  feedback sent in the request body, and no feedback prompt without a token.

## Production preview and disabled Maps

For a configured production preview, build with the same obviously synthetic
token used by the test server, then run with `WKC_BROWSER_PREVIEW=1`:

```sh
VITE_APPLE_MAPS_TOKEN=test-placeholder-not-a-token pnpm --filter @wkc/web build
WKC_BROWSER_PREVIEW=1 pnpm --filter @wkc/web test:browser
```

For a disabled production preview, build with `VITE_APPLE_MAPS_TOKEN` empty and
set both `WKC_BROWSER_PREVIEW=1` and `WKC_MAPS_DISABLED=1`. Provider-specific cases
are skipped; manual booking and the general UI checks still run.

Never supply a real Maps token to these tests. Passing mocked browser checks does
not validate real Apple authorization, address coverage, physical-device saved
contact autofill, Safari, Stripe, or a live deployment.
