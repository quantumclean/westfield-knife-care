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
          <p class="eyebrow">A little care for your everyday kitchen · Westfield</p>
          <h1>
            Good food starts with a <span class="hero-highlight">sharp knife.</span>
          </h1>
          <p class="hero-subhead">
            Your favourite knives. A fresh edge. More joy in the kitchen. We pick up, sharpen, and
            bring them back to your door in Westfield.
          </p>
          <p class="hero-promise">
            Choose a pickup date when booking. Return timing is arranged separately.
          </p>
          <div class="hero-ctas">
            <button type="button" class="cta-card cta-card-primary" onClick={onBook}>
              <span class="cta-title">{offer.cta_primary}</span>
              <span class="cta-sub">A fresh start for your kitchen favourites.</span>
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
        <figure class="hero-media">
          <img
            src="/images/oak-kitchen.webp"
            width="1024"
            height="768"
            alt="A chef’s knife and colourful fresh vegetables on an oak chopping board in a sunny kitchen."
            fetchpriority="high"
          />
          <figcaption>Made for the meals, and moments, at home.</figcaption>
          <span class="kitchen-stamp" aria-hidden="true">
            Chop chop.
            <br />
            Let’s cook!
          </span>
        </figure>
      </div>
    </section>
  );
}
