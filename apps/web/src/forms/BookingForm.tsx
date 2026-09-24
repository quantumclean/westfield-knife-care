import { useEffect, useMemo, useState } from "preact/hooks";
import {
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

  useEffect(() => {
    api
      .config()
      .then((config) => {
        if (config.care_days.length) setCareDays(config.care_days);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!careDay && careDays[0]) setCareDay(careDays[0]);
  }, [careDays, careDay]);

  const quote = useMemo(() => quoteOrder(price, knives), [price, knives]);

  async function onSubmit(event: Event) {
    event.preventDefault();
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
    <form class="booking-form" onSubmit={onSubmit} noValidate>
      <p class="muted">
        {offer.value_line} {offer.turnaround_promise}.
      </p>

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
          hint="For pickup and return texts."
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
          <Input id="city" name="city" autocomplete="address-level2" value="Westfield" required />
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

      {failure && <Notice tone="error">{failure}</Notice>}

      <div class="form-actions">
        <Button type="submit" size="lg" disabled={submitting} arrow>
          {submitting
            ? "Taking you to payment…"
            : `Pay ${formatMoney(quote.total_cents, quote.currency)} and book`}
        </Button>
        <span class="muted footnote">
          Secure card payment via Stripe. Full refund if we cannot pick up.
        </span>
      </div>
    </form>
  );
}
