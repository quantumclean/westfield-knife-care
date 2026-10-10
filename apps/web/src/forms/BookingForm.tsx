import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import {
  BRAND,
  createOrderSchema,
  formatCareDay,
  formatMoney,
  quoteOrder,
  upcomingCareDays,
  type ResolvedExperiment,
} from "@wkc/shared";
import { Button, Field, Input, Modal, Notice, Select, Textarea } from "@wkc/ui";
import { ApiError, api } from "../lib/api.ts";
import { EVENTS, track } from "../lib/analytics.ts";
import { errorSummary, useFocusFirstInvalid } from "../lib/forms.ts";
import {
  closedMessage,
  pickCareDay,
  resolveAvailability,
  type ConfigState,
} from "../lib/booking.ts";
import {
  emptyContact,
  loadDraft,
  saveDraft,
  type Contact,
  type ContactField,
} from "../lib/draft.ts";
import { sessionContext, type Session } from "../lib/session.ts";
import { US_STATES } from "../lib/us-states.ts";

export interface BookingDialogProps {
  open: boolean;
  onClose: () => void;
  session: Session;
  experiment: ResolvedExperiment;
  config: ConfigState;
  onRetryConfig: () => void;
  /** The visitor came back from a cancelled Stripe checkout. */
  resumed: boolean;
}

type Errors = Record<string, string>;
type Step = 1 | 2;

/** Plain-language messages for the fields people actually type. */
const FRIENDLY: Record<string, string> = {
  "customer.name": "Enter your name.",
  "customer.email": "Enter a valid email address.",
  "customer.phone": "Enter a valid phone number, or leave it blank.",
  "customer.address.line1": "Enter the street address for pickup.",
  "customer.address.city": "Enter your town or city.",
  "customer.address.state": "Choose your state.",
  "customer.address.zip": "Enter a 5-digit ZIP code.",
};
const STEP_ONE_FIELDS = new Set(["number_of_knives", "care_day"]);
const EXTRA_FIELDS = new Set(["customer.address.line2", "customer.phone", "notes"]);

/** Turn "customer.address.zip: message" issues into a field -> message map. */
function issuesToErrors(issues: string[]): Errors {
  const errors: Errors = {};
  for (const issue of issues) {
    const [path, ...rest] = issue.split(": ");
    if (path && rest.length) errors[path] ??= FRIENDLY[path] ?? rest.join(": ");
  }
  return errors;
}

/** "2026-10-13" -> { weekday: "Tue", day: "13", month: "Oct" } (dates are UTC calendar days). */
function dayParts(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(date);
  return {
    weekday: part({ weekday: "short" }),
    day: part({ day: "numeric" }),
    month: part({ month: "short" }),
  };
}

const plural = (n: number) => `${n} ${n === 1 ? "knife" : "knives"}`;

/**
 * Booking in two short steps inside a sheet: (1) how many knives and which
 * pickup day, both preselected so it can be a single tap, then (2) where to
 * collect them. The total and the next action sit in a footer that never
 * scrolls away. Pricing, validation and the fail-closed availability rules
 * are the same as before; only the way they are presented changed.
 */
export function BookingDialog({
  open,
  onClose,
  session,
  experiment,
  config,
  onRetryConfig,
  resumed,
}: BookingDialogProps) {
  const { price, offer } = experiment;
  const formId = useId();
  const draft = useMemo(() => loadDraft(), []);
  const validDraftKnives =
    draft && draft.knives >= 1 && draft.knives <= price.max_knives ? draft.knives : null;

  const [step, setStep] = useState<Step>(resumed && draft ? 2 : 1);
  const [knives, setKnives] = useState(validDraftKnives ?? price.knives_included);
  const [careDay, setCareDay] = useState(draft?.care_day ?? "");
  const [contact, setContact] = useState<Contact>(draft?.contact ?? emptyContact());
  const [moreOpen, setMoreOpen] = useState(
    Boolean(draft && (draft.contact.line2 || draft.contact.phone || draft.contact.notes)),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, errors);

  const fallbackDays = useMemo(() => upcomingCareDays(), []);
  const careDays =
    config.status === "ready" && config.config.care_days.length
      ? config.config.care_days
      : fallbackDays;

  // The server's list is the authority: if it no longer offers the chosen
  // day (stale device clock, a day rolling over), move to one it does offer.
  useEffect(() => {
    setCareDay((current) => pickCareDay(current, careDays));
  }, [careDays]);

  // Keep a tab-only draft so a cancelled checkout comes back filled in.
  useEffect(() => {
    const t = setTimeout(() => saveDraft({ knives, care_day: careDay, contact }), 250);
    return () => clearTimeout(t);
  }, [knives, careDay, contact]);

  // New step: start at the top, and put the cursor where typing starts.
  useEffect(() => {
    if (!open) return;
    const form = formRef.current;
    form?.closest(".modal-body")?.scrollTo({ top: 0 });
    if (step === 2 && form) {
      const inputs = Array.from(form.querySelectorAll<HTMLInputElement>(".step-address input"));
      (inputs.find((i) => !i.value) ?? inputs[0])?.focus({ preventScroll: true });
    }
  }, [step, open]);

  const availability = resolveAvailability(config, { dev: import.meta.env.DEV });
  const bookable = availability.status === "open";
  const quote = useMemo(() => quoteOrder(price, knives), [price, knives]);
  const total = formatMoney(quote.total_cents, quote.currency);

  const set = (key: ContactField) => (e: Event) => {
    const value = (e.currentTarget as HTMLInputElement).value;
    setContact((c) => ({ ...c, [key]: value }));
  };

  async function onSubmit(event: Event) {
    event.preventDefault();
    if (step === 1) {
      if (careDay) setStep(2);
      return;
    }
    if (!bookable || submitting) return;
    const v = (key: ContactField) => contact[key].trim();
    const candidate = {
      ...sessionContext(session),
      customer: {
        name: v("name"),
        email: v("email"),
        phone: v("phone") || undefined,
        address: {
          line1: v("line1"),
          line2: v("line2") || undefined,
          city: v("city"),
          state: v("state"),
          zip: v("zip"),
        },
      },
      number_of_knives: knives,
      care_day: careDay,
      notes: v("notes") || undefined,
    };

    const parsed = createOrderSchema.safeParse(candidate);
    if (!parsed.success) {
      const fieldErrors = issuesToErrors(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      );
      showErrors(fieldErrors);
      track(EVENTS.form_error, { form: "booking", fields: Object.keys(fieldErrors).join(",") });
      return;
    }

    setErrors({});
    setFailure(null);
    setSubmitting(true);
    track(EVENTS.booking_submitted, { knives, care_day: careDay, total_cents: quote.total_cents });
    try {
      const result = await api.createOrder(parsed.data);
      track(EVENTS.checkout_started, {
        order_id: result.order_id,
        total_cents: result.quote.total_cents,
      });
      window.location.assign(result.checkout_url);
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.issues.length) {
        showErrors(issuesToErrors(error.issues));
        setFailure("Please check the highlighted fields.");
      } else {
        setFailure(
          error instanceof Error ? error.message : "Something went wrong. Please try again.",
        );
      }
    }
  }

  function showErrors(next: Errors) {
    const keys = Object.keys(next);
    if (keys.some((k) => STEP_ONE_FIELDS.has(k))) setStep(1);
    if (keys.some((k) => EXTRA_FIELDS.has(k))) setMoreOpen(true);
    setErrors(next);
  }

  const quickCounts = Array.from({ length: Math.min(5, price.max_knives) }, (_, i) => i + 1);
  const many = knives > 5;
  const summary = `${plural(knives)} · ${careDay ? formatCareDay(careDay) : "Choose a day"}`;

  const footer = (
    <div class="receipt">
      <div class="receipt-total" aria-live="polite">
        <span class="receipt-amount">{total}</span>
        <span class="receipt-line">
          {summary}
          {quote.extra_knives > 0 && (
            <span class="muted">
              {" "}
              ({price.knives_included} in bundle + {quote.extra_knives} extra)
            </span>
          )}
        </span>
      </div>
      {step === 1 ? (
        <button type="submit" form={formId} class="btn btn-primary btn-lg" disabled={!careDay}>
          <span>Continue</span>
          <span class="btn-arrow" aria-hidden="true">
            →
          </span>
        </button>
      ) : (
        <button
          type="submit"
          form={formId}
          class="btn btn-primary btn-lg"
          disabled={submitting || !bookable}
        >
          <span>
            {submitting
              ? "Taking you to payment…"
              : availability.status === "checking"
                ? "Checking availability…"
                : availability.status === "closed"
                  ? "Booking unavailable"
                  : `Pay ${total} and book`}
          </span>
        </button>
      )}
      {step === 2 && <p class="receipt-note muted">Secure card payment via Stripe.</p>}
    </div>
  );

  return (
    <Modal
      open={open}
      variant="sheet"
      title={step === 1 ? "Knives & pickup day" : "Pickup address"}
      eyebrow={
        <>
          {offer.cta_primary} <span aria-hidden="true">·</span> Step {step} of 2
        </>
      }
      onClose={onClose}
      footer={footer}
    >
      <div class="sheet-progress" aria-hidden="true">
        <span style={{ width: step === 1 ? "50%" : "100%" }} />
      </div>
      <form id={formId} class="booking-form" ref={formRef} onSubmit={onSubmit} noValidate>
        {resumed && draft && step === 2 && (
          <Notice>
            Your checkout was cancelled. Your details are saved below, so you can pick up where you
            left off.
          </Notice>
        )}
        {availability.status === "closed" && (
          <div class="booking-closed">
            <Notice tone="error">{closedMessage(availability.reason, BRAND.support_email)}</Notice>
            {availability.reason === "unreachable" && (
              <Button variant="secondary" onClick={onRetryConfig}>
                Try again
              </Button>
            )}
          </div>
        )}

        {step === 1 ? (
          <div class="bk-step step-choices" key="step-1">
            <fieldset class="choice">
              <legend>How many knives?</legend>
              <div class="chips">
                {quickCounts.map((n) => (
                  <label class="chip" key={n}>
                    <input
                      type="radio"
                      name="knives"
                      value={n}
                      checked={knives === n}
                      onChange={() => setKnives(n)}
                    />
                    <span>
                      {n}
                      {n === price.knives_included && <small>bundle</small>}
                    </span>
                  </label>
                ))}
                {price.max_knives > 5 && (
                  <label class="chip">
                    <input
                      type="radio"
                      name="knives"
                      value="more"
                      checked={many}
                      onChange={() => setKnives(Math.max(6, knives))}
                    />
                    <span>6+</span>
                  </label>
                )}
              </div>
              {many && (
                <div class="stepper">
                  <button
                    type="button"
                    aria-label="One knife fewer"
                    disabled={knives <= 6}
                    onClick={() => setKnives((k) => Math.max(6, k - 1))}
                  >
                    −
                  </button>
                  <output aria-live="polite">{plural(knives)}</output>
                  <button
                    type="button"
                    aria-label="One knife more"
                    disabled={knives >= price.max_knives}
                    onClick={() => setKnives((k) => Math.min(price.max_knives, k + 1))}
                  >
                    +
                  </button>
                </div>
              )}
              <p class="choice-note muted">
                {formatMoney(price.bundle_price_cents, price.currency)} covers up to{" "}
                {plural(price.knives_included)}. Extra knives{" "}
                {formatMoney(price.extra_knife_price_cents, price.currency)} each
                {price.max_knives > 5 ? `, up to ${price.max_knives}` : ""}.
              </p>
              {errors.number_of_knives && <p class="field-message">{errors.number_of_knives}</p>}
            </fieldset>

            <fieldset class="choice">
              <legend>Pickup day</legend>
              <div class="days">
                {careDays.map((day) => {
                  const p = dayParts(day);
                  return (
                    <label class="day" key={day}>
                      <input
                        type="radio"
                        name="care_day"
                        value={day}
                        checked={careDay === day}
                        onChange={() => setCareDay(day)}
                        aria-label={formatCareDay(day)}
                      />
                      <span class="day-wk" aria-hidden="true">
                        {p.weekday}
                      </span>
                      <span class="day-num" aria-hidden="true">
                        {p.day}
                      </span>
                      <span class="day-mo" aria-hidden="true">
                        {p.month}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p class="choice-note muted">
                We collect between 8am and 12pm. Return timing is confirmed separately.
              </p>
              {errors.care_day && <p class="field-message">{errors.care_day}</p>}
            </fieldset>
          </div>
        ) : (
          <div class="bk-step step-address" key="step-2">
            <button type="button" class="step-back" onClick={() => setStep(1)}>
              <span aria-hidden="true">←</span> {summary}
              <span class="step-back-edit">Change</span>
            </button>
            <Field label="Your name" htmlFor="bk-name" required error={errors["customer.name"]}>
              <Input
                id="bk-name"
                name="name"
                autocomplete="name"
                enterkeyhint="next"
                value={contact.name}
                onInput={set("name")}
                required
              />
            </Field>
            <Field label="Email" htmlFor="bk-email" required error={errors["customer.email"]}>
              <Input
                id="bk-email"
                name="email"
                type="email"
                inputMode="email"
                autocomplete="email"
                enterkeyhint="next"
                value={contact.email}
                onInput={set("email")}
                required
              />
            </Field>
            <Field
              label="Street address"
              htmlFor="bk-line1"
              required
              error={errors["customer.address.line1"]}
            >
              <Input
                id="bk-line1"
                name="line1"
                autocomplete="address-line1"
                enterkeyhint="next"
                value={contact.line1}
                onInput={set("line1")}
                required
              />
            </Field>
            <div class="form-row form-row-3">
              <Field
                label="Town"
                htmlFor="bk-city"
                required
                error={errors["customer.address.city"]}
              >
                <Input
                  id="bk-city"
                  name="city"
                  autocomplete="address-level2"
                  enterkeyhint="next"
                  value={contact.city}
                  onInput={set("city")}
                  required
                />
              </Field>
              <Field
                label="State"
                htmlFor="bk-state"
                required
                error={errors["customer.address.state"]}
              >
                <Select
                  id="bk-state"
                  name="state"
                  autocomplete="address-level1"
                  value={contact.state}
                  onChange={set("state")}
                  required
                >
                  {US_STATES.map((s) => (
                    <option value={s} key={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="ZIP" htmlFor="bk-zip" required error={errors["customer.address.zip"]}>
                <Input
                  id="bk-zip"
                  name="zip"
                  autocomplete="postal-code"
                  inputMode="numeric"
                  enterkeyhint="done"
                  maxLength={10}
                  value={contact.zip}
                  onInput={set("zip")}
                  required
                />
              </Field>
            </div>

            <details
              class="more"
              open={moreOpen}
              onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary>Apartment, phone or notes</summary>
              <Field
                label="Apartment, suite, etc."
                htmlFor="bk-line2"
                error={errors["customer.address.line2"]}
              >
                <Input
                  id="bk-line2"
                  name="line2"
                  autocomplete="address-line2"
                  value={contact.line2}
                  onInput={set("line2")}
                />
              </Field>
              <Field
                label="Phone"
                htmlFor="bk-phone"
                error={errors["customer.phone"]}
                hint="Optional. We may use it to coordinate pickup and return."
              >
                <Input
                  id="bk-phone"
                  name="phone"
                  type="tel"
                  autocomplete="tel"
                  value={contact.phone}
                  onInput={set("phone")}
                />
              </Field>
              <Field
                label="Notes"
                htmlFor="bk-notes"
                error={errors.notes}
                hint="Serrated blades, gate codes, where to leave the bag."
              >
                <Textarea id="bk-notes" name="notes" value={contact.notes} onInput={set("notes")} />
              </Field>
            </details>
          </div>
        )}

        <p class="visually-hidden" role="status">
          {errorSummary(errors)}
        </p>
        {failure && <Notice tone="error">{failure}</Notice>}
      </form>
    </Modal>
  );
}
