import { WHY_US, describePrice, formatMoney, type ResolvedExperiment } from "@wkc/shared";
import { Button, Section } from "@wkc/ui";

export interface PricingProps {
  experiment: ResolvedExperiment;
  onBook: () => void;
  onPilot: () => void;
}

/** One ticket with the visitor's own price, then the waitlist as a quiet second option. */
export function Pricing({ experiment, onBook, onPilot }: PricingProps) {
  const { offer, price } = experiment;
  const money = (cents: number) => formatMoney(cents, price.currency);
  return (
    <Section id="pricing" tone="muted">
      <div class="pricing-wrap">
        <div class="pricing-copy">
          <h2>
            One simple <em>price.</em>
          </h2>
          <p class="muted">
            The price includes pickup from your door and the return to your doorstep. You see the
            total before you pay.
          </p>
          <ul class="why">
            {WHY_US.map((item) => (
              <li key={item}>
                <span class="stamp">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div class="price-ticket ticket">
          <div class="price-ticket-top">
            <span class="price-ticket-label">{offer.cta_primary}</span>
            <p class="price">
              <span class="price-amount">{money(price.bundle_price_cents)}</span>
              <span class="price-unit">for {price.knives_included} knives</span>
            </p>
            <ul class="ticket-list">
              <li>Extra knives {money(price.extra_knife_price_cents)} each</li>
              <li>Pickup at your door, 8am – 12pm</li>
              <li>Back on your doorstep</li>
              <li>Secure card payment via Stripe</li>
            </ul>
            <Button size="lg" onClick={onBook} arrow>
              Get started
            </Button>
          </div>
          <div class="ticket-tear" aria-hidden="true" />
          <p class="pricing-footnote muted">
            {describePrice(price)}. Stripe charges your card when you complete checkout.
          </p>
        </div>
      </div>

      <div class="pilot-row">
        <div>
          <h3>Always Sharp pilot</h3>
          <p class="muted">Give us a dull knife, get a sharp one. Weekly, biweekly or monthly.</p>
        </div>
        <Button variant="secondary" onClick={onPilot} arrow>
          Join the waitlist
        </Button>
      </div>
    </Section>
  );
}
