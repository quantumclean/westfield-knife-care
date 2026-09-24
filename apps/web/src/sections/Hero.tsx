import type { OfferVersion } from "@wkc/shared";
import { Button } from "@wkc/ui";

export interface HeroProps {
  offer: OfferVersion;
  onBook: () => void;
  onPilot: () => void;
}

/** Wraps the highlighted word in the headline, if the offer names one. */
function Headline({ offer }: { offer: OfferVersion }) {
  const word = offer.headline_highlight;
  if (!word) return <h1>{offer.headline}</h1>;
  const index = offer.headline.toLowerCase().indexOf(word.toLowerCase());
  if (index < 0) return <h1>{offer.headline}</h1>;
  return (
    <h1>
      {offer.headline.slice(0, index)}
      <span class="highlight">{offer.headline.slice(index, index + word.length)}</span>
      {offer.headline.slice(index + word.length)}
    </h1>
  );
}

export function Hero({ offer, onBook, onPilot }: HeroProps) {
  return (
    <section class="hero">
      <div class="container hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">Local Pickup • Professional Sharpening • Fast Return</p>
          <Headline offer={offer} />
          <p class="hero-subhead">{offer.subhead}</p>
          <p class="hero-promise">{offer.turnaround_promise}. Choose how you want to stay sharp.</p>
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
      <p class="visually-hidden">
        <Button onClick={onBook}>{offer.cta_primary}</Button>
      </p>
    </section>
  );
}
