import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  BRAND,
  createOrderSchema,
  formatCareDay,
  formatMoney,
  quoteOrder,
  upcomingCareDays,
  type ResolvedExperiment,
} from "@wkc/shared";
import { Button, Field, Input, Notice, Select, Textarea } from "@wkc/ui";
import { ApiError, api } from "../lib/api.ts";
import { EVENTS, track } from "../lib/analytics.ts";
import { errorSummary, useFocusFirstInvalid } from "../lib/forms.ts";
import {
  closedMessage,
  pickCareDay,
  resolveAvailability,
  type ConfigState,
} from "../lib/booking.ts";
import { sessionContext, type Session } from "../lib/session.ts";

export interface BookingFormProps {
  session: Session;
  experiment: ResolvedExperiment;
}

type Errors = Record<string, string>;

/** Turn "customer.address.zip: message" issues into a field -> message map. */
function issuesToErrors(issues: string[]): Errors {
  const errors: Errors = {};
  for (const issue of issues) {
    const [path, ...rest] = issue.split(": ");
    if (path && rest.length) errors[path] ??= rest.join(": ");
  }
  return errors;
}

export function BookingForm({ session, experiment }: BookingFormProps) {
  const { price, offer } = experiment;
  const [careDays, setCareDays] = useState<string[]>(() => upcomingCareDays());
  const [knives, setKnives] = useState(price.knives_included);
  const [careDay, setCareDay] = useState<string>("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [configState, setConfigState] = useState<ConfigState>({ status: "loading" });
  const [configAttempt, setConfigAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, errors);

  useEffect(() => {
    let cancelled = false;
    setConfigState({ status: "loading" });
    api
      .config()
      .then((config) => {
        if (cancelled) return;
        if (config.care_days.length) setCareDays(config.care_days);
        setConfigState({ status: "ready", config });
      })
      .catch(() => {
        if (!cancelled) setConfigState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [configAttempt]);

  // The server's list is the authority: if it no longer offers the chosen
  // day (stale device clock, a day rolling over), move to one it does offer.
  useEffect(() => {
    setCareDay((current) => pickCareDay(current, careDays));
  }, [careDays]);

  const availability = resolveAvailability(configState, { dev: import.meta.env.DEV });
  const open = availability.status === "open";

  const quote = useMemo(() => quoteOrder(price, knives), [price, knives]);

  async function onSubmit(event: Event) {
    event.preventDefault();
    if (!open || submitting) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const candidate = {
      ...sessionContext(session),
      customer: {
        name: value("name"),
        email: value("email"),
        phone: value("phone") || undefined,
        address: {
          line1: value("line1"),
          line2: value("line2") || undefined,
          city: value("city"),
          state: value("state"),
          zip: value("zip"),
        },
      },
      number_of_knives: knives,
      care_day: careDay,
      notes: value("notes") || undefined,
    };

    const parsed = createOrderSchema.safeParse(candidate);
    if (!parsed.success) {
      const fieldErrors = issuesToErrors(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      );
      setErrors(fieldErrors);
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
        setErrors(issuesToErrors(error.issues));
        setFailure("Please check the highlighted fields.");
      } else {
        setFailure(
          error instanceof Error ? error.message : "Something went wrong. Please try again.",
        );
      }
    }
  }

  const knifeOptions = Array.from({ length: price.max_knives }, (_, i) => i + 1);

  return (
    <form class="booking-form" ref={formRef} onSubmit={onSubmit} noValidate>
      <p class="muted">
        {offer.value_line} {offer.turnaround_promise}.
      </p>

      {availability.status === "closed" && (
        <div class="booking-closed">
          <Notice tone="error">{closedMessage(availability.reason, BRAND.support_email)}</Notice>
          {availability.reason === "unreachable" && (
            <Button variant="secondary" onClick={() => setConfigAttempt((n) => n + 1)}>
              Try again
            </Button>
          )}
        </div>
      )}

      <div class="form-row">
        <Field label="How many knives?" htmlFor="knives" required error={errors.number_of_knives}>
          <Select
            id="knives"
            name="knives"
            value={knives}
            onChange={(e) => setKnives(Number(e.currentTarget.value))}
          >
            {knifeOptions.map((n) => (
              <option value={n} key={n}>
                {n} {n === 1 ? "knife" : "knives"}
                {n <= price.knives_included ? " (bundle)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Pickup day"
          htmlFor="care_day"
          required
          error={errors.care_day}
          hint="We collect between 8am and 12pm."
        >
          <Select
            id="care_day"
            name="care_day"
            value={careDay}
            onChange={(e) => setCareDay(e.currentTarget.value)}
          >
            {careDays.map((day) => (
              <option value={day} key={day}>
                {formatCareDay(day)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div class="quote" aria-live="polite">
        <span>
          {knives} {knives === 1 ? "knife" : "knives"}
          {quote.extra_knives > 0 && (
            <span class="muted">
              {" "}
              ({price.knives_included} in bundle + {quote.extra_knives} extra)
            </span>
          )}
        </span>
        <strong>{formatMoney(quote.total_cents, quote.currency)}</strong>
      </div>

      <Field label="Your name" htmlFor="name" required error={errors["customer.name"]}>
        <Input id="name" name="name" autocomplete="name" required />
      </Field>
      <div class="form-row">
        <Field label="Email" htmlFor="email" required error={errors["customer.email"]}>
          <Input id="email" name="email" type="email" autocomplete="email" required />
        </Field>
        <Field
          label="Phone"
          htmlFor="phone"
          error={errors["customer.phone"]}
          hint="Optional. We may use it to coordinate pickup and return."
        >
          <Input id="phone" name="phone" type="tel" autocomplete="tel" />
        </Field>
      </div>
      <Field
        label="Pickup address"
        htmlFor="line1"
        required
        error={errors["customer.address.line1"]}
      >
        <Input
          id="line1"
          name="line1"
          autocomplete="address-line1"
          placeholder="Street address"
          required
        />
      </Field>
      <Field
        label="Apartment, suite, etc."
        htmlFor="line2"
        error={errors["customer.address.line2"]}
      >
        <Input id="line2" name="line2" autocomplete="address-line2" />
      </Field>
      <div class="form-row form-row-3">
        <Field label="City" htmlFor="city" required error={errors["customer.address.city"]}>
          {/* defaultValue, not value: the field is uncontrolled, so re-renders must not reset it. */}
          <Input
            id="city"
            name="city"
            autocomplete="address-level2"
            defaultValue="Westfield"
            required
          />
        </Field>
        <Field label="State" htmlFor="state" required error={errors["customer.address.state"]}>
          <Input
            id="state"
            name="state"
            autocomplete="address-level1"
            maxLength={2}
            placeholder="NJ"
            required
          />
        </Field>
        <Field label="ZIP" htmlFor="zip" required error={errors["customer.address.zip"]}>
          <Input id="zip" name="zip" autocomplete="postal-code" inputMode="numeric" required />
        </Field>
      </div>
      <Field
        label="Notes"
        htmlFor="notes"
        error={errors.notes}
        hint="Serrated blades, gate codes, where to leave the bag."
      >
        <Textarea id="notes" name="notes" />
      </Field>

      <p class="visually-hidden" role="status">
        {errorSummary(errors)}
      </p>
      {failure && <Notice tone="error">{failure}</Notice>}

      <div class="form-actions">
        <Button type="submit" size="lg" disabled={submitting || !open} arrow>
          {submitting
            ? "Taking you to payment…"
            : availability.status === "checking"
              ? "Checking availability…"
              : availability.status === "closed"
                ? "Booking unavailable"
                : `Pay ${formatMoney(quote.total_cents, quote.currency)} and book`}
        </Button>
        <span class="muted footnote">Secure card payment via Stripe.</span>
      </div>
    </form>
  );
}
