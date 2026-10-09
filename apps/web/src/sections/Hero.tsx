import type { OfferVersion } from "@wkc/shared";

export interface HeroProps {
  offer: OfferVersion;
  onBook: () => void;
  onPilot: () => void;
}

export function Hero({ offer, onBook, onPilot }: HeroProps) {
  return (
    <section class="hero">
      <div class="container hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">Local Pickup • Knife Sharpening • Return to Your Door</p>
          <h1>Knife sharpening in Westfield</h1>
          <p class="hero-subhead">Review pickup dates and pricing before booking.</p>
          <p class="hero-promise">Return timing is arranged separately.</p>
          <div class="hero-ctas">
            <button type="button" class="cta-card cta-card-primary" onClick={onBook}>
              <span class="cta-title">{offer.cta_primary}</span>
              <span class="cta-sub">Get your knives sharpened.</span>
              <span class="cta-arrow" aria-hidden="true">
                ›
              </span>
            </button>
            <button type="button" class="cta-card cta-card-secondary" onClick={onPilot}>
              <span class="cta-title">{offer.cta_secondary}</span>
              <span class="cta-sub">Give us a dull knife, get a sharp one. Always.</span>
              <span class="cta-arrow" aria-hidden="true">
                ›
              </span>
            </button>
          </div>
        </div>
        <div class="hero-media">
          <img src="/images/hero.svg" width="640" height="480" alt="" fetchpriority="high" />
        </div>
      </div>
    </section>
  );
}
