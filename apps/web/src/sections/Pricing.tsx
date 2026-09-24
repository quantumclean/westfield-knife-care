import { WHY_US, describePrice, formatMoney, type ResolvedExperiment } from "@wkc/shared";
import { Button, Card, Icon, Section } from "@wkc/ui";

export interface PricingProps {
  experiment: ResolvedExperiment;
  onBook: () => void;
  onPilot: () => void;
}

export function Pricing({ experiment, onBook, onPilot }: PricingProps) {
  const { offer, price } = experiment;
  return (
    <Section id="pricing" tone="muted">
      <div class="pricing-grid">
        <div>
          <h2>Simple Pricing</h2>
          <div class="pricing-cards">
            <Card>
              <h3>{offer.cta_primary}</h3>
              <p class="price">
                <span class="price-amount">
                  {formatMoney(price.bundle_price_cents, price.currency)}
                </span>
                <span class="muted"> for {price.knives_included} knives</span>
              </p>
              <p class="muted">
                {offer.value_line} Extra knives{" "}
                {formatMoney(price.extra_knife_price_cents, price.currency)} each.
              </p>
              <Button onClick={onBook} arrow>
                Get Started
              </Button>
            </Card>
            <Card tone="muted">
              <h3>Always Sharp Pilot</h3>
              <p class="price">
                <span class="price-amount price-amount-sm">Join the waitlist</span>
              </p>
              <p class="muted">
                Give us a dull knife, get a sharp one. Weekly, biweekly or monthly.
              </p>
              <Button variant="secondary" onClick={onPilot} arrow>
                Join the Waitlist
              </Button>
            </Card>
          </div>
          <p class="muted pricing-footnote">
            {describePrice(price)}, {offer.turnaround_promise.toLowerCase()}. Pay securely by card
            when you book.
          </p>
        </div>
        <div class="why-us">
          <h2>Why Westfield Knife Care?</h2>
          <ul class="checklist">
            {WHY_US.map((item) => (
              <li key={item}>
                <Icon name="check" size={20} class="check-icon" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
