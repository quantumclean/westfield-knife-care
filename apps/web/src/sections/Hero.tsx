import { formatCareDay, formatMoney, type OfferVersion, type PriceVersion } from "@wkc/shared";
import { CuttingBoard } from "./CuttingBoard.tsx";

export interface HeroProps {
  offer: OfferVersion;
  price: PriceVersion;
  /** First bookable pickup day (YYYY-MM-DD), or null while unknown or closed. */
  nextPickup: string | null;
  onBook: () => void;
  onPilot: () => void;
  /** Pointer or focus on the main button: start loading the booking sheet. */
  onIntent: () => void;
}

/**
 * Everything a flyer visitor needs in one screen: what it is, what it costs,
 * when the next pickup is, and one button. The price is the visitor's own
 * experiment arm, exactly as the pricing section and checkout show it.
 */
export function Hero({ offer, price, nextPickup, onBook, onPilot, onIntent }: HeroProps) {
  const knives = `${price.knives_included} ${price.knives_included === 1 ? "knife" : "knives"}`;
  return (
    <section class="hero" aria-labelledby="hero-title">
      <div class="container hero-inner">
        <div class="hero-copy">
          <p class="hero-kicker">
            <span class="stamp">Westfield, NJ</span>
            <span>Local pickup · No shipping</span>
          </p>
          <h1 id="hero-title">
            Sharp knives, <em>without leaving home.</em>
          </h1>
          <p class="hero-lede">
            We pick up your kitchen knives at your door, sharpen them, and bring them back to your
            doorstep.
          </p>

          <div class="hero-ticket ticket">
            <div class="hero-price">
              <span class="hero-amount">
                {formatMoney(price.bundle_price_cents, price.currency)}
              </span>
              <span>
                for {knives}
                <span class="muted">
                  Extra knives {formatMoney(price.extra_knife_price_cents, price.currency)} each
                </span>
              </span>
            </div>
            {nextPickup && (
              <div class="hero-next">
                <span class="hero-next-label">Next pickup</span>
                <strong>{formatCareDay(nextPickup)}</strong>
                <span class="muted">8am – 12pm</span>
              </div>
            )}
          </div>

          <div class="hero-actions">
            <button
              type="button"
              class="btn btn-primary btn-lg hero-cta"
              onClick={onBook}
              onPointerEnter={onIntent}
              onPointerDown={onIntent}
              onFocus={onIntent}
            >
              <span>{offer.cta_primary}</span>
              <span class="btn-arrow" aria-hidden="true">
                →
              </span>
            </button>
            <button type="button" class="link-quiet" onClick={onPilot}>
              or join the Always Sharp waitlist
            </button>
          </div>
        </div>
        <div class="hero-board">
          <CuttingBoard />
        </div>
      </div>
    </section>
  );
}
