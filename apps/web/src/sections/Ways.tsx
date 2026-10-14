import {
  GIFT_WAY,
  MAIL_IN_WAY,
  PICKUP_WAY,
  WAYS_INTRO,
  describePrice,
  formatCareDay,
  serviceTownsLabel,
  type InterestOnlyTopic,
  type PriceVersion,
} from "@wkc/shared";
import { Button, Section } from "@wkc/ui";

export interface WaysProps {
  price: PriceVersion;
  /** Label of the primary booking button, from the visitor's offer. */
  ctaLabel: string;
  /** First bookable pickup day (YYYY-MM-DD), or null while unknown or closed. */
  nextPickup: string | null;
  onBook: () => void;
  /** Opens the interest-only form. Nothing here can be bought. */
  onInterest: (topic: InterestOnlyTopic) => void;
  /** Pointer or focus on the booking button: start loading the booking sheet. */
  onIntent: () => void;
}

/**
 * The three choices, kept honest about what exists. Local pickup is the only one that can be
 * booked. Mail-in is an alternative way to hand over knives, so it sits beside pickup. A gift
 * is a way to pay for someone's sharpening, so it sits apart, as its own band: it is not a
 * third fulfillment method. Mail-in and gift open the waitlist; neither takes payment.
 */
export function Ways({ price, ctaLabel, nextPickup, onBook, onInterest, onIntent }: WaysProps) {
  return (
    <Section id="ways" title={WAYS_INTRO.title} subtitle={WAYS_INTRO.subtitle}>
      <div class="ways">
        <p class="ways-label">{WAYS_INTRO.how_heading}</p>
        <div class="ways-grid">
          <article class="way way-open" aria-labelledby="way-pickup-title">
            <p class="way-status way-status-open">
              {nextPickup ? `Next pickup ${formatCareDay(nextPickup)}` : PICKUP_WAY.status}
            </p>
            <h3 id="way-pickup-title">{PICKUP_WAY.title}</h3>
            <p>{PICKUP_WAY.body}</p>
            <p class="way-meta">
              {describePrice(price)}, pickup and return included.
              <br />
              Serving {serviceTownsLabel()}.
            </p>
            {/* A native button, like the hero's, so intent can prefetch the booking sheet. */}
            <button
              type="button"
              class="btn btn-primary btn-md way-cta"
              onClick={onBook}
              onPointerEnter={onIntent}
              onPointerDown={onIntent}
              onFocus={onIntent}
            >
              <span>{ctaLabel}</span>
              <span class="btn-arrow" aria-hidden="true">
                ›
              </span>
            </button>
          </article>

          <article class="way way-soon" aria-labelledby="way-mail-in-title">
            <p class="way-status way-status-soon">{MAIL_IN_WAY.status}</p>
            <h3 id="way-mail-in-title">{MAIL_IN_WAY.title}</h3>
            <p>{MAIL_IN_WAY.body}</p>
            <p class="way-meta way-warn">{MAIL_IN_WAY.note}</p>
            <Button
              class="way-cta"
              variant="secondary"
              onClick={() => onInterest("mail_in")}
              aria-label={`${MAIL_IN_WAY.cta} in mail-in sharpening`}
            >
              {MAIL_IN_WAY.cta}
            </Button>
          </article>
        </div>

        <article class="way way-gift" id="gift" aria-labelledby="way-gift-title">
          <svg class="way-gift-art" viewBox="0 0 48 48" aria-hidden="true">
            <rect x="7" y="20" width="34" height="22" rx="2" fill="#f6af97" />
            <rect x="5" y="14" width="38" height="8" rx="2" fill="#fff7e8" />
            <path d="M24 14 V42" stroke="#24604b" stroke-width="5" />
            <path
              d="M24 14 C18 4 10 8 15 13 Z M24 14 C30 4 38 8 33 13 Z"
              fill="#f2c94c"
              stroke="#24604b"
              stroke-width="2"
              stroke-linejoin="round"
            />
          </svg>
          <div class="way-gift-copy">
            <p class="way-eyebrow">{GIFT_WAY.eyebrow}</p>
            <h3 id="way-gift-title">{GIFT_WAY.title}</h3>
            <p class="way-status way-status-soon">{GIFT_WAY.status}</p>
            <p>{GIFT_WAY.body}</p>
            <p class="way-meta">{GIFT_WAY.note}</p>
          </div>
          <Button
            class="way-cta"
            variant="secondary"
            onClick={() => onInterest("gift")}
            aria-label={`${GIFT_WAY.cta} in gifting`}
          >
            {GIFT_WAY.cta}
          </Button>
        </article>
      </div>
    </Section>
  );
}
