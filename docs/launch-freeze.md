# Launch freeze

**Status: in effect as of v1.0.0 (see the git tag and PR #1).**

v1 is merged and tagged. Until experiment-001 and experiment-002 conclude
(see the decision rules in `docs/experiment-plan.md`), changes to this
repository are limited to what's needed to keep the pilot running:

## In scope during the freeze

- **Launch-blocking bugs**: anything that stops a real visitor from
  booking, being charged correctly, or being attributed correctly — a
  crash, a wrong price, a broken webhook, a form that won't submit, a
  security or data-integrity issue found in production.
- **Operational necessities**: a Stripe key rotation, a DNS fix, a capacity
  or cost problem, anything `docs/operations.md`'s incident section covers.
- **Recording data**, obviously: orders, pickups, returns, feedback, the
  weekly summary review. None of that is a "change" in this sense.
- **Adding a new experiment** is explicitly allowed and is the point of the
  registry (see "How experiments work" in the README) — but it is a
  deliberate, reviewed addition with its own hypothesis in
  `docs/experiment-plan.md`, not a drive-by edit to `experiments.ts`.

## Out of scope until the freeze lifts

- Redesigns, refactors, new features, new packages, dependency upgrades
  "while we're in there," copy polish that isn't fixing a bug, new
  analytics events nobody asked for, infrastructure changes made for
  elegance rather than necessity.
- Editing an existing offer or price version in place. This was already a
  hard rule (see the docstring on `packages/shared/src/experiments.ts`) and
  the freeze doesn't loosen it — a new version and a new experiment, always.

The reasoning: the whole point of Wave 1 is a clean read on two flyers
against a fixed product. Every non-essential change during the run is a
potential confound — if conversion moves, was it the price, or the Tuesday
you shipped a redesigned button? Keeping the surface still is what makes
the result trustworthy enough to act on.

## Lifting the freeze

The freeze ends when an experiment is concluded per the decision rules in
`docs/experiment-plan.md` (15+ paid orders in the trailing arm and a clear
revenue-per-visitor gap, or the 8-week backstop). At that point:

1. Update `experiments.ts`: set the losing experiment's `status` to
   `concluded`, and don't touch anything else about it — its flyer, still
   in a customer's drawer, must keep resolving to the price/copy it always
   had (`isHonorablePin` in `packages/shared/src/experiments.ts` is what
   guarantees this).
2. Write up the result in `docs/experiment-plan.md`.
3. Open this file's freeze status back up, or delete it if there's no
   reason to expect another freeze soon.
