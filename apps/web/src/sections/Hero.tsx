import { formatMoney, type OfferVersion, type PriceVersion } from "@wkc/shared";
import { Button, Icon } from "@wkc/ui";

export interface HeroProps {
  offer: OfferVersion;
  price: PriceVersion;
  onBook: () => void;
  onPilot: () => void;
}

export function Hero({ offer, price, onBook, onPilot }: HeroProps) {
  return (
    <section class="hero">
      <div class="container hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">Westfield knife sharpening · Picked up at your door</p>
          <h1>
            Good food starts with a <span class="hero-highlight">sharp knife.</span>
          </h1>
          <p class="hero-subhead">
            A fresh edge for your kitchen favourites. We pick up, sharpen, and bring your knives
            home. You get back to the good part: cooking.
          </p>
          <p class="hero-price">
            <strong>{formatMoney(price.bundle_price_cents, price.currency)}</strong> for{" "}
            {price.knives_included} knives{" "}
            <a href="#pricing">
              See what’s included <Icon name="arrow" size={16} />
            </a>
          </p>
          <div class="hero-ctas">
            <Button size="lg" onClick={onBook} arrow>
              {offer.cta_primary}
            </Button>
            <a class="film-jump" href="#process-film">
              <span class="film-play" aria-hidden="true" />
              Watch the 22-second film
            </a>
          </div>
          <p class="hero-promise">
            Choose a pickup date when booking. Return timing is arranged separately.
          </p>
          <button type="button" class="pilot-link" onClick={onPilot}>
            {offer.cta_secondary} <Icon name="arrow" size={16} />
          </button>
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
