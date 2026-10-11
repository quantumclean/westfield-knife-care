import { useEffect, useState } from "preact/hooks";
import { formatMoney, type PriceVersion } from "@wkc/shared";

export interface StickyCtaProps {
  label: string;
  price: PriceVersion;
  /** A dialog is open: get out of the way. */
  hidden: boolean;
  onBook: () => void;
  onIntent: () => void;
}

/**
 * Phones only (CSS): once the hero's button has scrolled away, keep the
 * price and the button one thumb away at the bottom of the screen.
 */
export function StickyCta({ label, price, hidden, onBook, onIntent }: StickyCtaProps) {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const target = document.querySelector(".hero-cta");
    if (!target || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    io.observe(target);
    return () => io.disconnect();
  }, []);

  const visible = past && !hidden;
  return (
    <div
      class="sticky-cta"
      data-visible={visible ? "true" : "false"}
      aria-hidden={!visible}
      {...{ inert: !visible }}
    >
      <span class="sticky-price">
        <strong>{formatMoney(price.bundle_price_cents, price.currency)}</strong> for{" "}
        {price.knives_included} knives
      </span>
      <button
        type="button"
        class="btn btn-primary btn-md"
        onClick={onBook}
        onPointerDown={onIntent}
        tabIndex={visible ? 0 : -1}
      >
        {label}
      </button>
    </div>
  );
}
