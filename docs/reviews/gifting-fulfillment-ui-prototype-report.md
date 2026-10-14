# Gifting and fulfillment UI prototype: implementation report

> **Unreleased prototype, subject to the launch freeze.** This UI is not approved for release. It
> must not be merged or deployed until the owner grants an exception under `docs/launch-freeze.md`
> (as booking UX v2 had). It is open as a **draft PR for review only**.

**Not committed, not pushed, no PR open.** All changes are uncommitted working-tree edits in the
worktree below, verified against `main` (`467d1a9`). Nothing here accessed production, a remote
database, Stripe or Apple. It follows the plan in
[`claude-gifting-ux-review.md`](./claude-gifting-ux-review.md) (on branch
`worktree-gifting-ux-review`).

**Last updated 2026-10-14**, during the validation pass ahead of a commit. The desktop header-link
height issue below was fixed in this pass (`apps/web/src/styles.css`, `.site-nav a`). Every check
below was re-run on the fixed source, and the results replace the earlier ones. A commit and push
are pending explicit, live confirmation from the owner that the Cloudflare Pages branch-exclusion
setting is actually saved — see "Cloudflare Pages previews" and the safety note at the end of this
report.

## Status at a glance

**Recommendation: READY FOR INTEGRATION REVIEW**, pending the owner decisions below. The desktop
header-link height bug is fixed; the full Playwright suite is green (112 passed, 0 failed, 2
skipped, 0 timed out, 8.1 min, three viewports).

| Approved improvement                                                        | Status                                                                                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Accurate local-pickup hero wording                                       | Complete. Headline unchanged; "No shipping" removed.                                                                                                 |
| 2. Gift navigation and gift-interest section                                | Complete. The desktop link was 23.8px tall against a 24px minimum; fixed to 24px. All three viewports now pass, including the desktop scroll checks. |
| 3. Safe knife preparation and return instructions                           | Complete. The owner should confirm the advice matches the real process.                                                                              |
| 4. Mobile layout at 320px and 390px                                         | Complete. All browser checks at 390px and 320px pass.                                                                                                |
| 5. Pickup available now; mail-in and gifts coming soon, with interest forms | Complete. Submissions are saved through the existing API, including into the D1 schema (see "API persistence findings").                             |

`/a` still shows **$39 for 4 knives** and `/b` **$49 for 5 knives**, and the existing checkout tests
pass unchanged for both.

## Where it lives

|          |                                                                                               |
| -------- | --------------------------------------------------------------------------------------------- |
| Worktree | `C:\dev\knife_sharp\westfield-knife-care\.claude\worktrees\gifting-fulfillment-ui-prototype`  |
| Branch   | `feat/gifting-fulfillment-ui-prototype` (from local `main`, which equalled `origin/main`)     |
| State    | uncommitted working-tree changes, validated 2026-10-14; not committed, not pushed, no PR open |

**Path note.** The second-pass brief named `C:\dev\knife_sharp\wkc-claude`. That directory does not
exist and is not a registered worktree. The branch name is exactly as requested; the worktree is at
the path above. The main checkout was found on another agent's branch mid-session
(`fix/flyer-route-pricing-override`), which is why a separate worktree was used.

**External edits kept.** During the first session, someone else edited this worktree: `Hero.tsx`
(lede reworded to "With local pickup, we collect your knives from your door…"), `Header.tsx` (a
"Gift" nav link to `#gift`), `Ways.tsx` (`id="gift"` on the gift band), and `ways.spec.ts` (a test
for that link). They are consistent with the design and are kept and tested. The lede change added
a hero line, which a small CSS change offsets (see issue 10).

## What a visitor now sees

1. **Hero.** Headline unchanged: "Good food starts with a sharp knife." "No shipping" is gone; the
   kicker says "Picked up and returned at your door". A quiet link, "Mail-in or a gift? See your
   options", leads to the new section. Price and next-pickup ticket are unchanged.
2. **Header.** A fourth link, "Gift", leads to the gift band (`#gift`).
3. **Three ways to a fresh edge** (`#ways`, new). Under "How we get your knives":
   - **Local pickup and return**: "Next pickup …" or "Open for booking", the visitor's own arm price
     (`$39 for 4 knives` on `/a`, `$49 for 5 knives` on `/b`), the six served towns, and the existing
     booking button. This is the only choice that can be bought.
   - **Mail-in sharpening**: "Coming soon · interest only". States there is no price, shipping method
     or start date and **no shipping kit**, and says "Please do not mail knives to us."
   - **Give it as a gift** is a separate band below, not a third card, so it reads as a way to pay for
     someone's sharpening rather than a way to hand over knives. "Coming soon · interest only". "We are
     not selling gifts yet. Nothing is charged, and we do not need your recipient's details."
4. **Interest forms.** The two "Tell us you are interested" buttons open the existing waitlist dialog
   in an interest-only mode: an "Interest only. Nothing is for sale yet and you will not be charged."
   notice, no interest or rhythm pickers, no address, optional phone, and a notes hint that says not to
   enter a recipient's name or address. The confirmation says "Nothing has been charged."
5. **Getting your knives ready** (`#prepare`, new, after Pricing). Four steps (wash and dry, cover each
   blade, pack together, leave at your door), a note for unusual knives, what to do when knives come
   back, and a "Mail-in, when it opens" preview that says it is not available and there is no kit.
6. **FAQ.** `how-to-pack` rewritten to match; two new items, "Can I mail my knives to you?" and "Can I
   give this as a gift?", both answering "Not yet".
7. **320px.** The hero is compacted on phones up to 380px wide so the booking button is on the first
   screen (its bottom edge moved from 688px to 575px on a 640px-tall screen).

Unchanged on purpose: pricing, experiments, `/a` and `/b`, `BookingForm.tsx`, the thank-you page,
checkout, address search, and every API route.

## Changed files

The 2026-10-14 session changed only this report. The application changes below are from the first
session.

**New**

- `apps/web/src/sections/Ways.tsx`: the three-ways section.
- `apps/web/src/sections/Prep.tsx`: preparation guidance.
- `apps/web/e2e/ways.spec.ts`: browser tests for all of the above.
- `docs/reviews/gifting-fulfillment-ui-prototype-report.md` (this file) and
  `docs/reviews/screenshots/gifting-fulfillment-ui/` (11 screenshots).

**Modified**

- `packages/shared/src/types.ts`: `SERVICE_INTERESTS` gains `mail_in`, `gift`; `CADENCES` gains `once`; new `INTEREST_ONLY_TOPICS`.
- `packages/shared/src/analytics.ts`: locations `ways`, `ways-mail-in`, `ways-gift`; sections `ways`, `prepare`.
- `packages/shared/src/content.ts`: new `WAYS_INTRO`, `PICKUP_WAY`, `MAIL_IN_WAY`, `GIFT_WAY`, `PREP`; tagline, step 1 and `WHY_US` no longer say "No shipping"/"Westfield" only; FAQ updated and extended.
- `apps/web/src/app.tsx`: section order, interest handler, modal titles.
- `apps/web/src/forms/PilotForm.tsx`: interest-only mode; the Always Sharp form is unchanged.
- `apps/web/src/sections/Hero.tsx`, `Header.tsx`: see above.
- `apps/web/src/art/ready.ts`: a "wash" icon.
- `apps/web/src/lib/engagement.ts`: section-view selectors for the new sections.
- `apps/web/src/styles.css`: new sections and the 320px hero.
- `apps/web/index.html`: description and social text no longer say "no shipping".
- `docs/data-model.md`, `docs/analytics-events.md`: new values documented.
- Tests: `apps/web/test/copy-claims.test.ts`, `packages/shared/test/{schemas,analytics}.test.ts`, `apps/api/test/waitlist-events.test.ts`, `apps/web/e2e/helpers.ts`.

## Second-pass review

| Check                                       | Result                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pickup bookable; others clearly coming soon | Pass (2026-10-14, all three viewports). Pickup opens the unchanged booking sheet. Mail-in and gift each show "Coming soon · interest only", have one button that registers interest, and contain no price or purchase wording (asserted in unit and browser tests). |
| `/a` and `/b` pricing and checkout          | Pass (2026-10-14, all three viewports). `/a` shows $39 for 4, `/b` $49 for 5, in the hero, the pickup card and the booking sheet. The existing browser tests that assert the order payload for both arms pass unchanged. No change to `BookingForm.tsx` or the API. |
| Interest forms vs. existing API             | Pass, including D1 (2026-10-14). See "API persistence findings".                                                                                                                                                                                                    |
| Gift navigation                             | Pass on all three viewports (2026-10-14, after the fix below). The link is tall enough, the URL ends in `#gift`, and the band lands below the sticky header, including on desktop.                                                                                  |
| Keyboard                                    | Pass for the new controls (2026-10-14): Enter opens a form, Escape closes it, the focus ring is visible (outline width greater than 0). A full tab-order audit was not done.                                                                                        |
| Contrast                                    | Pass (measured in the first session, not re-measured). From computed styles for 18 new text and button pairs: lowest is 5.05:1 in light and 7.01:1 in dark (AA needs 4.5:1). The grain texture and the sticky bar overlay are not included.                         |
| Mobile button visibility                    | Pass (2026-10-14). At 320x640 the booking button is fully on the first screen, at least 250px wide and 44px tall. No horizontal overflow at 320, 390 or 1280. Every new button is 44px or taller.                                                                   |
| Address-entry usability                     | All booking-address browser tests pass at all three viewports (2026-10-14, Apple SDK mocked). The first session's manual walkthrough at 320, 390 and 1280 found pre-existing rough edges, listed under issues.                                                      |

## Test results (2026-10-14, final source, after the header-link fix)

All checks were run in the worktree on 2026-10-14, against the source as it stands now, including
the `.site-nav a` height fix.

| Check                                                            | Result                                          |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| `pnpm typecheck` (shared, ui, web, api)                          | Pass                                            |
| `pnpm lint` (Prettier)                                           | Pass (only this report needed reformatting)     |
| Shared unit tests (`pnpm --filter @wkc/shared test`)             | 98 passed, 0 failed (8 files)                   |
| Web unit tests (`vitest run --maxWorkers=3`)                     | 217 passed, 0 failed (17 files)                 |
| API full suite (`vitest run --testTimeout=60000 --maxWorkers=2`) | 148 passed, 1 failed (16 files; see below)      |
| D1 persistence check (scratch test, not in the repo; below)      | 2 passed, 0 failed                              |
| **Playwright, full suite** (dev server, one worker, 8.1 min)     | **112 passed, 0 failed, 2 skipped** (114 slots) |

**Playwright by viewport** — all green, no failures, no timeouts:

| Project              | Viewport        | Passed | Failed | Skipped |
| -------------------- | --------------- | ------ | ------ | ------- |
| `desktop-light`      | 1280x900, light | 37     | 0      | 1       |
| `mobile-dark`        | 390x844, dark   | 37     | 0      | 1       |
| `small-mobile-light` | 320x740, light  | 38     | 0      | 0       |

- **The desktop Gift-link failure from the prior pass is fixed.** `.site-nav a` now sets
  `min-height: 24px` (previously the link's box was 23.8px tall, just under the WCAG 2.5.8 target
  size the test enforces). `e2e/ways.spec.ts:77`, "the Gift nav link leads to the interest-only gift
  band, without a purchase path", now passes on all three viewports, including the desktop scroll
  and sticky-header checks it previously never reached.
- **The two skips** are expected: the 320px-only test ("at 320px wide and 640px tall the booking
  button is on the first screen") skips on the other two viewports.
- **Slot count.** 114 slots (38 tests on 3 viewports), unchanged from the prior pass.
- **Browser.** The installed Playwright Chromium is build 1243; the repo's Playwright expects 1248.
  Tests ran with `WKC_BROWSER_EXECUTABLE` pointing at the installed build, no `WKC_BROWSER_PREVIEW`
  (dev server mode). Nothing was downloaded.
- **API full suite, one known pre-existing failure:** `analytics aggregates at scale > summarises
200,000 events…` took 31.9s against a 30s wall-clock limit, with correct counts, in SQL analytics
  code this prototype does not touch. Same failure as the prior pass; not caused by this work.
- `pnpm build` was not re-run in this pass (typecheck and the full unit/API/Playwright suites were);
  the prior pass recorded it passing and no source changed except the one CSS rule above.

## API persistence findings

**What the forms send.** Both interest forms post to the existing `POST /api/waitlist` with
`service_interest` set to `mail_in` or `gift`, `cadence` set to `once`, and the visitor's
`experiment_id`. There is no address, recipient or order field, and nothing is sent to `/orders`.
The browser tests check this request for both forms, using a mocked API.

**In-memory store (repo test).** `apps/api/test/waitlist-events.test.ts` runs the real handler
in-process with the in-memory store. It accepts `mail_in` and `gift` with `once`, saves both, creates
no order, and still rejects unknown interests. 8 of 8 pass.

**D1 (verified 2026-10-14, local SQLite only).** A scratch test, kept outside the repo, ran the real
API app with the real `D1Repository` on top of the repo's SQLite stand-in for D1
(`apps/api/test/sqlite-d1.ts`), with every migration (0001 to 0005) applied. It asserted that:

- `POST /api/waitlist` returns 201 for a `mail_in` entry and a `gift` entry, each with `cadence: "once"`.
- the `waitlist` table then holds exactly those two rows, with `service_interest` and `cadence` inside
  the JSON `data` column and the email lowercased (`Ada@Example.com` saved as `ada@example.com`).
- `listWaitlist()`, which the admin waitlist export uses, returns both entries.
- the `orders` table is empty.
- an unknown interest (`voucher`) returns 400 and leaves the `waitlist` table empty.

Both tests passed. No staging or production database was accessed. To keep this check, add it as a
repo test during integration; the core is:

```ts
const db = sqliteD1(); // in-memory SQLite with migrations 0001-0005
const { app } = makeDeps({ repo: new D1Repository(db) });
await app.request(
  "/api/waitlist",
  json("POST", {
    experiment_id: "experiment-001",
    name: "Ada Example",
    email: "Ada@Example.com",
    service_interest: "mail_in",
    cadence: "once",
  }),
);
db.raw.prepare("SELECT email, json_extract(data, '$.service_interest') AS si FROM waitlist").all();
// [{ email: "ada@example.com", si: "mail_in" }]
```

**Migrations: none needed.** `migrations/0001_wkc_d1.sql` defines `waitlist(id, created_at, email,
data)`, and its only check is `json_valid(data)`. Interest and rhythm are fields inside `data`, not
columns, so the database does not limit their values. Migrations 0002 to 0005 do not touch `waitlist`.
This is based on the repo's migration files; the staging database itself was not inspected. A
database with 0001 to 0005 applied is compatible.

**Deployment dependency: ship web and API together** (they do on Cloudflare Pages). There are two
reasons:

1. **Waitlist.** The API validates submissions with the shared schema, which now allows `mail_in`,
   `gift` and `once`. A web build live against an older API would show the visitor an error on
   submit.
2. **Analytics.** The new UI sends sections `ways` and `prepare` and locations `ways`,
   `ways-mail-in` and `ways-gift`. The API checks every event in a batch strictly against the shared
   catalog (`createEventBatchSchema` in `packages/shared/src/event-schemas.ts`, using
   `validateEventProps`), so one unknown value rejects the whole batch with a 400. The browser
   client does not retry a 400 (it only pauses on 429 and 503), so against an older API the other
   events in such a batch would be lost, for both arms. This comes from reading the code; it was not
   exercised.

**Experiment reporting.** Mail-in and gift entries carry the visitor's `experiment_id`, so the reports
count them as waitlist signups for that arm (`apps/api/src/repo/commerce-report.ts:80`, and the D1
query at `apps/api/src/repo/d1.ts:453`). That count feeds the weekly summary and insights reports. The
decision rule uses paid orders and revenue per visitor, which are unaffected. Either exclude these
interests from the signup count before shipping, or note the change in the analysis.

**Local preview stores in memory only.** The local API server (`pnpm dev`) never uses D1. With no
`TABLE_NAME` set it uses the in-memory store, so submissions made while previewing are gone when the
server stops. D1 is used only by the Cloudflare build.

## Cloudflare Pages previews

**Every branch push publishes a public preview unless the commit is marked.** The Cloudflare Pages Git
integration builds pushed branches. For example, commit `82039bf` on PR #30's branch got a
"Cloudflare Pages: Deployed successfully" check, with a Preview URL and a Branch Preview URL on
`westfield-knife-care.pages.dev`. Those previews include the Pages Function, the API. Its preview
bindings (D1, secrets) are set in the Cloudflare dashboard and cannot be seen from the repo.

**`[CF-Pages-Skip]` stops it.** Commits whose message starts with `[CF-Pages-Skip]` (`0a82765`,
`a56b2a6`) got no Cloudflare check at all. No GitHub Actions workflow deploys: `deploy.yml` and
`deploy-staging.yml` run only when started by hand, and `test.yml` only lints, typechecks, tests,
builds and uploads the build as a workflow artifact.

**This branch** is pushed as one commit starting with `[CF-Pages-Skip]`. Whether a Cloudflare check
appeared after the push is recorded in the PR description, because this report is committed before
the push. **Keep that prefix on every push to this branch** until the owner grants a launch-freeze
exception. Otherwise an unreleased UI goes out to a public URL with an API whose bindings are not
known.

## Screenshots

In `docs/reviews/screenshots/gifting-fulfillment-ui/`. Taken in the first session from the production
build with the API mocked; **not retaken on 2026-10-14**.

| File                          | Shows                                                      |
| ----------------------------- | ---------------------------------------------------------- |
| `320-hero.png`                | Hero at 320x640: the booking button is on the first screen |
| `320-ways.png`                | Pickup card at 320px                                       |
| `320-gift.png`                | Gift band at 320px                                         |
| `320-gift-form.png`           | Interest-only form at 320px                                |
| `320-address-suggestions.png` | Address search at 320px (mocked Apple SDK)                 |
| `390-ways.png`                | Three ways at 390px                                        |
| `390-prepare.png`             | Getting ready at 390px                                     |
| `390-dark-ways.png`           | Dark mode at 390px                                         |
| `1280-hero.png`               | Desktop hero, with the new "Gift" nav link                 |
| `1280-ways.png`               | Three ways on desktop                                      |
| `1280-prepare.png`            | Getting ready on desktop                                   |

## Preview locally

**Before starting**, make sure no real credentials can be picked up:

- There is no `.env` at the worktree root. The API's dev script loads `../../.env` if it exists; at
  present only `.env.example` is there.
- `TABLE_NAME`, `STRIPE_SECRET_KEY` and `SSM_PARAMETER_PREFIX` are not set in your shell. With
  `TABLE_NAME` set, the local API would use the legacy DynamoDB store. With `STRIPE_SECRET_KEY` set, it
  would use real Stripe. With `SSM_PARAMETER_PREFIX` set, it would load secrets from AWS.

From the worktree root:

```sh
pnpm install --offline --frozen-lockfile
pnpm dev
```

Then open:

- **http://localhost:5173/a** for the A arm ($39 for 4 knives)
- **http://localhost:5173/b** for the B arm ($49 for 5 knives)

The API runs at `http://localhost:8787`, and the web dev server proxies `/api` to it. The API's log
should show two warnings: "TABLE_NAME not set; data is not persisted" and "STRIPE_SECRET_KEY not set;
checkout is simulated". Booking and both interest forms then work end to end, with no real data and
no real payment.

- **Layout only:** `pnpm --filter @wkc/web dev` is enough to review the page, but the booking and
  interest buttons will show an error because no API is running.
- **Mobile:** use the browser's device mode at 320px and 390px wide.
- **Apple address search (optional):** set `VITE_APPLE_MAPS_TOKEN` in `apps/web/.env.local` (see
  `docs/apple-address-autocomplete.md`). Without it, enter the address by hand; that fallback is
  tested.

**Re-running the browser tests** (PowerShell, from `apps/web`, with nothing else heavy running):

```powershell
$env:WKC_BROWSER_EXECUTABLE = "$env:LOCALAPPDATA\ms-playwright\chromium-1243\chrome-win64\chrome.exe"
pnpm exec playwright test --workers=1
```

Do not set `WKC_BROWSER_PREVIEW`; see the abandoned first attempt above. The run takes about
10 minutes.

## Owner decisions and unresolved issues

**Resolved in this pass**

1. **Desktop header link size (fixed).** The "Gift" link was 23.8px tall on desktop; the test
   requires 24px, the WCAG 2.5.8 minimum target size. Fixed by adding `min-height: 24px` (with
   `display: inline-flex; align-items: center`) to `.site-nav a` in `apps/web/src/styles.css`, which
   applies to all header links, not just "Gift". The full Playwright suite was re-run and is green
   on all three viewports, including the desktop scroll and sticky-header checks this test previously
   never reached.

**Owner decisions before shipping**

2. **Launch freeze.** This is a visible change to the page both arms see. Under
   `docs/launch-freeze.md` it needs an explicit exception (as booking UX v2 had) or must wait for the
   experiments to conclude. It does not touch the arm differences (price version, offer CTA). If it
   ships, record the deploy timestamp and compare arms within each period.
3. **Experiment reporting.** Decide whether mail-in and gift entries should be excluded from each arm's
   waitlist-signup count (see "API persistence findings").
4. **Backend dependency.** The web and API must ship together, for waitlist submissions and for
   analytics batches (see "API persistence findings"). No migration is needed, and no remote database
   was touched.
5. **Who reads the interest list, and what counts as enough.** Mail-in and gift entries land in the
   same waitlist export as Always Sharp (`service_interest` is `mail_in` or `gift`). Decide who reviews
   them and the threshold at which to build either feature. The pages promise "we will email you if it
   opens", so someone must be ready to do that.
6. **Preparation advice is the owner's to confirm.** The steps are instructions to customers (wash and
   dry, cover each blade, pack together, leave at the door, and wash again before first use). They make
   no claim about how knives are handled afterwards, and the copy tests ban sanitization, insurance,
   guarantee and shipping-kit claims. Confirm the advice matches the real process.
7. **Printed flyers.** The flyer template in `marketing/flyers` still says "no shipping". It was not
   changed.

**Known limits of this prototype**

8. **Gift analytics are deliberately coarse.** The only gift signals are which button was used and the
   submitted interest. The shared catalog rejects any recipient, address or typed text (tested in shared
   and API tests).
9. **Mail-in and gifts are not built.** No payment, kit, shipping, voucher, recipient fields or pricing
   exist. Real versions need their own design and API review.
10. **Hero length (resolved).** The reworded lede (external edit) added a line, pushing the desktop
    button's bottom edge from 778px to 808px on a 1280x800 window. Widening `.hero-lede` from 36ch to
    42ch restored it to 778px; the 320px and 390px positions are unaffected.
11. **Page length.** At 390px the page grew from about 4,900px to about 7,800px with the two new
    sections. Consider collapsing the "when they come back" and "mail-in" notes into disclosures on
    phones.

**Accessibility and testing gaps**

12. A full keyboard tab-order audit was not done; only the new controls were checked.
13. Contrast was measured in the first session and not re-measured.
14. Real devices, Safari and real Apple authorisation were not tested; the Apple SDK was mocked, as in
    the repo's own tests.
15. The Playwright browser build (1243) differs from the one the repo expects (1248).

**Pre-existing, not changed (the booking flow was out of scope)**

- At 320px the pinned total truncates its summary ("4 knives · Th…").
- Address search needs a tap on "Find address with Apple Maps", then appears after the phone field,
  separate from the street field. Apartment and notes stay in a collapsed section.
- The privacy panel does not mention Apple Maps search.
- The out-of-area waitlist hand-off does not mention mail-in.
- Header link "FAQ" is 27px wide (44px tall) on phones.

## Recommendation

**READY FOR INTEGRATION REVIEW.** The five improvements are in place, pricing and checkout are
unchanged, the interest forms save correctly (D1 included, no migration needed), and the desktop
header-link check that previously failed is fixed and verified. Typecheck, lint, the shared and web
unit suites, the API waitlist tests, and the full Playwright suite (112 passed, 0 failed, 2 skipped,
three viewports) are all green. The one remaining API-suite failure is a pre-existing wall-clock
flake in unrelated analytics-aggregation code (see "Test results").

Settle before shipping: the launch-freeze exception (item 2 above — this has not been granted),
the experiment signup count, and who follows up on the interest list. Optionally, add the D1
persistence check above as a repo test.

**This branch has not been committed or pushed, and no PR is open.** Per the launch freeze and the
explicit instruction this session started under, a commit will be prepared locally, but pushing and
opening even a draft PR waits on the owner's own live confirmation that the Cloudflare Pages
branch-exclusion setting is actually saved — not a relayed or pasted claim of that fact.
